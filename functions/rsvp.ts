import type { PagesFunction, Response as CfResponse } from '@cloudflare/workers-types';
import { validateSession } from '../src/lib/cookies';
import { decryptJson, encryptJson } from '../src/lib/crypto';
import { logError } from '../src/lib/logger';
import { checkRateLimit } from '../src/lib/ratelimit';
import {
  cloneAttendance,
  cloneAttendanceRecord,
  cloneDietaryNotes,
  cloneMealSelections,
  clonePendingMealSelections,
  cloneParty,
  clonePartyMember,
  computePendingMealSelections,
  createAttendanceRecord,
  normalizeGuestProfileAttendance
} from '../src/lib/party';
import type {
  Env,
  EventDetails,
  AttendanceSource,
  EventAttendanceStatus,
  GuestProfile,
  PartyEventResponse,
  PartyMember,
  PartyMealSelectionMap,
  PartyAttendanceMap,
  RSVP
} from '../src/types';

interface EventConfig {
  requiresMealSelection: boolean;
  mealOptions?: Set<string>;
  collectDietaryNotes: boolean;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  try {
    const cookieHeader = request.headers.get('Cookie');
    if (!cookieHeader) {
      return new Response('Unauthorized', { status: 401 }) as unknown as CfResponse;
    }

    const session = await validateSession(cookieHeader, env);
    if (!session) {
      return new Response('Unauthorized', { status: 401 }) as unknown as CfResponse;
    }

    const clientIp =
      request.headers.get('CF-Connecting-IP') ||
      request.headers.get('X-Forwarded-For') ||
      'unknown';

    const submissionsPerWindow = Number.parseInt(env.RSVP_SUBMISSIONS_PER_10MIN || '20', 10);
    const rsvpAllowed = await checkRateLimit(
      env,
      `rsvp:${session.guest_id}:${clientIp}`,
      submissionsPerWindow,
      600
    );
    if (!rsvpAllowed) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Please wait a moment before submitting again.',
        code: 'RSVP_RATE_LIMIT'
      }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' }
      }) as unknown as CfResponse;
    }

    const guestRow = await env.DB.prepare(
      'SELECT enc_profile, email_hash FROM guests WHERE id = ?'
    ).bind(session.guest_id).first();

    if (!guestRow) {
      return new Response('Guest not found', { status: 404 }) as unknown as CfResponse;
    }

    const guestProfile = await decryptJson(
      guestRow.enc_profile as string,
      env.KEK_B64,
      'guests',
      guestRow.email_hash as string,
      'profile'
    ) as GuestProfile;

    normalizeGuestProfileAttendance(guestProfile);

    const eventRow = await env.DB.prepare(
      'SELECT enc_details FROM event WHERE id = 1'
    ).first();

    if (!eventRow) {
      return new Response('Event not configured', { status: 500 }) as unknown as CfResponse;
    }

    const eventDetails = await decryptJson(
      eventRow.enc_details as string,
      env.KEK_B64,
      'event',
      '1',
      'details'
    ) as EventDetails;

    if (eventDetails.rsvpStatus?.mode === 'closed') {
      const message = eventDetails.rsvpStatus?.message?.trim() || 'RSVPs are closed';
      return new Response(JSON.stringify({ success: false, error: message, code: 'RSVP_CLOSED' }), {
        status: 423,
        headers: { 'Content-Type': 'application/json' }
      }) as unknown as CfResponse;
    }

    const formData = await request.formData();
    const submissionEpoch = Math.floor(Date.now() / 1000);
    const submittedAt = new Date(submissionEpoch * 1000).toISOString();
    const responsesPayload = formData.get('partyResponses')?.toString() ?? '{}';

    const eventConfig = buildEventConfig(eventDetails);
    const parsedResponses = parsePartyResponses(responsesPayload, guestProfile.party, eventConfig);

    const previousParty = cloneParty(guestProfile.party);
    const { party: updatedParty, storedResponses } = applyResponsesToParty(
      previousParty,
      parsedResponses,
      submissionEpoch,
      'guest',
      eventConfig
    );
    const attendanceChanged = hasAttendanceChanged(previousParty, updatedParty);

    const pendingMealEvents = Array.from(
      new Set(
        Object.values(storedResponses)
          .flatMap(response => response.pendingMealSelections ?? [])
      )
    );

    const rsvpRecord: RSVP = {
      partyResponses: storedResponses,
      submittedAt
    };

    guestProfile.party = updatedParty;
    guestProfile.rsvp = rsvpRecord;

    const encProfile = await encryptJson(
      guestProfile,
      env.KEK_B64,
      'guests',
      guestRow.email_hash as string,
      'profile'
    );

    const encRsvp = await encryptJson(
      rsvpRecord,
      env.KEK_B64,
      'rsvps',
      session.guest_id.toString(),
      'rsvp'
    );

    const now = Math.floor(Date.now() / 1000);

    await env.DB.prepare(
      'UPDATE guests SET enc_profile = ?, updated_at = ? WHERE id = ?'
    ).bind(encProfile, now, session.guest_id).run();

    await env.DB.prepare(
      `INSERT INTO rsvps (guest_id, enc_rsvp, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(guest_id)
       DO UPDATE SET enc_rsvp = excluded.enc_rsvp, updated_at = excluded.updated_at`
    ).bind(
      session.guest_id,
      encRsvp,
      now
    ).run();

    await env.DB.prepare(
      'INSERT INTO audit_events (guest_id, type, created_at) VALUES (?, ?, ?)'
    ).bind(session.guest_id, 'rsvp_submit', now).run();

    if (attendanceChanged) {
      await env.DB.prepare(
        'INSERT INTO audit_events (guest_id, type, created_at) VALUES (?, ?, ?)'
      ).bind(session.guest_id, 'event_attendance_updated', now).run();
    }

    return new Response(JSON.stringify({ success: true, pendingMealEvents }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }) as unknown as CfResponse;

  } catch (error) {
    logError('rsvp', error);
    return new Response('An error occurred', { status: 500 }) as unknown as CfResponse;
  }
};

function buildEventConfig(details: EventDetails): Map<string, EventConfig> {
  const config = new Map<string, EventConfig>();

  if (!Array.isArray(details.events)) {
    return config;
  }

  details.events.forEach(event => {
    if (!event || typeof event !== 'object') {
      return;
    }
    const eventId = typeof event.id === 'string' ? event.id.trim() : '';
    if (!eventId) {
      return;
    }

    const mealOptionsArray = Array.isArray(event.mealOptions)
      ? event.mealOptions
          .map(option => (typeof option === 'string' ? option.trim() : ''))
          .filter(Boolean)
      : [];
    const mealOptionSet = mealOptionsArray.length > 0 ? new Set(mealOptionsArray) : undefined;

    config.set(eventId, {
      requiresMealSelection: Boolean(event.requiresMealSelection),
      mealOptions: mealOptionSet,
      collectDietaryNotes: Boolean(event.collectDietaryNotes)
    });
  });

  return config;
}

function parsePartyResponses(
  payload: string,
  party: PartyMember[],
  eventConfig: Map<string, EventConfig>
): Record<string, PartyEventResponse> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new Error('Invalid RSVP payload');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid RSVP payload');
  }

  const memberMap = new Map<string, PartyMember>();
  party.forEach(member => {
    memberMap.set(member.personId, member);
  });

  const normalized: Record<string, PartyEventResponse> = {};

  for (const member of party) {
    const rawEntry = (parsed as Record<string, unknown>)[member.personId];
    normalized[member.personId] = normalizeMemberResponse(member, rawEntry, eventConfig);
  }

  for (const personId of Object.keys(parsed as Record<string, unknown>)) {
    if (!memberMap.has(personId)) {
      throw new Error('Unexpected person identifier');
    }
  }

  return normalized;
}

function normalizeMemberResponse(
  member: PartyMember,
  rawEntry: unknown,
  eventConfig: Map<string, EventConfig>
): PartyEventResponse {
  const invitedEvents = Array.isArray(member.invitedEvents)
    ? member.invitedEvents.map(eventId => eventId.trim()).filter(Boolean)
    : [];

  const eventsInput = rawEntry && typeof rawEntry === 'object'
    ? (rawEntry as Record<string, unknown>).events
    : undefined;
  const mealsInput = rawEntry && typeof rawEntry === 'object'
    ? (rawEntry as Record<string, unknown>).meals ?? (rawEntry as Record<string, unknown>).mealSelections
    : undefined;

  const attendance: PartyAttendanceMap = {};
  const mealSelections: PartyMealSelectionMap = {};
  const dietaryNotes: Record<string, string> = {};

  invitedEvents.forEach(eventId => {
    const status = extractSubmittedStatus(
      eventsInput && typeof eventsInput === 'object'
        ? (eventsInput as Record<string, unknown>)[eventId]
        : undefined
    );

    attendance[eventId] = createAttendanceRecord(status, 'guest', null);

    const config = eventConfig.get(eventId);
    const mealValue = mealsInput && typeof mealsInput === 'object'
      ? (mealsInput as Record<string, unknown>)[eventId]
      : undefined;
    const mealChoice = typeof mealValue === 'string' ? mealValue.trim() : '';

    if (status === 'yes' && mealChoice) {
      if (config?.mealOptions && !config.mealOptions.has(mealChoice)) {
        throw new Error('Invalid meal selection');
      }
      mealSelections[eventId] = mealChoice;
    }

    const dietaryInput = rawEntry && typeof rawEntry === 'object'
      ? (rawEntry as Record<string, unknown>).dietaryNotes
      : undefined;
    const dietaryValue = dietaryInput && typeof dietaryInput === 'object'
      ? (dietaryInput as Record<string, unknown>)[eventId]
      : undefined;
    const dietaryNote = typeof dietaryValue === 'string' ? dietaryValue.trim().slice(0, 500) : '';

    if (config?.collectDietaryNotes && dietaryNote) {
      dietaryNotes[eventId] = dietaryNote;
    }
  });

  const meals = Object.keys(mealSelections).length > 0 ? mealSelections : undefined;
  const pendingMealSelections = computePendingMealSelections(
    invitedEvents,
    attendance,
    meals,
    eventId => Boolean(eventConfig.get(eventId)?.requiresMealSelection)
  );

  return {
    events: attendance,
    mealSelections: meals,
    dietaryNotes: Object.keys(dietaryNotes).length > 0 ? dietaryNotes : undefined,
    pendingMealSelections
  };
}

function extractSubmittedStatus(value: unknown): EventAttendanceStatus {
  if (value && typeof value === 'object') {
    return normalizeStatus((value as Record<string, unknown>).status);
  }
  return normalizeStatus(value);
}

function normalizeStatus(value: unknown): EventAttendanceStatus {
  if (value === 'yes' || value === 'no') {
    return value;
  }
  return 'pending';
}

function applyResponsesToParty(
  party: PartyMember[],
  responses: Record<string, PartyEventResponse>,
  submissionEpoch: number,
  submissionSource: AttendanceSource,
  eventConfig: Map<string, EventConfig>
): { party: PartyMember[]; storedResponses: Record<string, PartyEventResponse> } {
  const nextParty = party.map(member => {
    const response = responses[member.personId];
    const invitedEvents = Array.isArray(member.invitedEvents)
      ? member.invitedEvents.map(eventId => eventId.trim()).filter(Boolean)
      : [];

    if (!response) {
      const cloned = clonePartyMember(member);
      cloned.invitedEvents = invitedEvents;
      return cloned;
    }

    const previousAttendance = member.attendance || {};
    const nextAttendance: PartyAttendanceMap = {};

    invitedEvents.forEach(eventId => {
      const prior = previousAttendance[eventId] || createAttendanceRecord('pending', 'system', null);
      const requestedStatus = response.events?.[eventId]?.status ?? prior.status;

      if (requestedStatus !== prior.status) {
        nextAttendance[eventId] = createAttendanceRecord(requestedStatus, submissionSource, submissionEpoch);
      } else {
        nextAttendance[eventId] = cloneAttendanceRecord(prior);
      }
    });

    const mealSelections = buildMealSelections(invitedEvents, response.mealSelections, nextAttendance);
    const dietaryNotes = buildDietaryNotes(invitedEvents, response.dietaryNotes);
    const pendingMealSelections = computePendingMealSelections(
      invitedEvents,
      nextAttendance,
      mealSelections,
      eventId => Boolean(eventConfig.get(eventId)?.requiresMealSelection)
    );

    return {
      ...member,
      invitedEvents,
      attendance: nextAttendance,
      mealSelections,
      dietaryNotes,
      pendingMealSelections
    };
  });

  const storedResponses: Record<string, PartyEventResponse> = {};
  nextParty.forEach(member => {
    storedResponses[member.personId] = {
      events: cloneAttendance(member.attendance),
      mealSelections: cloneMealSelections(member.mealSelections),
      dietaryNotes: cloneDietaryNotes(member.dietaryNotes),
      pendingMealSelections: clonePendingMealSelections(member.pendingMealSelections)
    };
  });

  return { party: nextParty, storedResponses };
}

function hasAttendanceChanged(before: PartyMember[], after: PartyMember[]): boolean {
  const beforeMap = new Map<string, PartyMember>();
  before.forEach(member => {
    beforeMap.set(member.personId, member);
  });

  for (const member of after) {
    const previous = beforeMap.get(member.personId);
    if (!previous) {
      return true;
    }
    const events = new Set([
      ...Object.keys(previous.attendance || {}),
      ...Object.keys(member.attendance || {})
    ]);
    for (const eventId of events) {
      const beforeStatus = previous.attendance?.[eventId]?.status ?? 'pending';
      const afterStatus = member.attendance?.[eventId]?.status ?? 'pending';
      if (beforeStatus !== afterStatus) {
        return true;
      }
    }
  }

  return false;
}

function buildMealSelections(
  invitedEvents: string[],
  submittedMeals: PartyMealSelectionMap | undefined,
  attendance: PartyAttendanceMap
): PartyMealSelectionMap | undefined {
  if (!submittedMeals) {
    return undefined;
  }

  const meals: PartyMealSelectionMap = {};
  invitedEvents.forEach(eventId => {
    const choice = submittedMeals[eventId];
    if (!choice) {
      return;
    }
    if (attendance[eventId]?.status === 'yes') {
      meals[eventId] = choice;
    }
  });

  return Object.keys(meals).length > 0 ? meals : undefined;
}

function buildDietaryNotes(
  invitedEvents: string[],
  submittedNotes: Record<string, string> | undefined
): Record<string, string> | undefined {
  if (!submittedNotes) {
    return undefined;
  }

  const notes: Record<string, string> = {};
  invitedEvents.forEach(eventId => {
    const note = submittedNotes[eventId];
    if (typeof note === 'string' && note.trim()) {
      notes[eventId] = note.trim();
    }
  });

  return Object.keys(notes).length > 0 ? notes : undefined;
}
