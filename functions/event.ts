import type { PagesFunction, Response as CfResponse } from '@cloudflare/workers-types';
import { validateSession } from '../src/lib/cookies';
import { decryptJson } from '../src/lib/crypto';
import { logError } from '../src/lib/logger';
import { renderEventPage, type EventPageViewModel } from '../src/views/event';
import { formatMemberDisplayName } from '../src/lib/name-format';
import {
  normalizeGuestProfileAttendance,
  cloneAttendance,
  cloneMealSelections,
  cloneDietaryNotes
} from '../src/lib/party';
import type {
  CeremonyGuideSections,
  Env,
  EventDetails,
  GuestProfile,
  LocalGuideSections,
  TransportationSections,
  PartyEventResponse,
  PartyMember,
  PartyMealSelectionMap,
  PartyRole,
  RSVP
} from '../src/types';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  try {
    const cookieHeader = request.headers.get('Cookie');
    if (!cookieHeader) {
      return redirectToInvite();
    }

    const session = await validateSession(cookieHeader, env);
    if (!session) {
      return redirectToInvite();
    }

    const guestRow = await env.DB.prepare(
      'SELECT enc_profile, email_hash FROM guests WHERE id = ?'
    ).bind(session.guest_id).first();

    if (!guestRow) {
      return redirectToInvite();
    }

    const guestProfile = await decryptJson(
      guestRow.enc_profile as string,
      env.KEK_B64,
      'guests',
      guestRow.email_hash as string,
      'profile'
    ) as GuestProfile;

    normalizeGuestProfileAttendance(guestProfile);

    const rsvpRow = await env.DB.prepare(
      'SELECT enc_rsvp FROM rsvps WHERE guest_id = ?'
    ).bind(session.guest_id).first();

    let rsvpData: RSVP | undefined;
    if (rsvpRow && rsvpRow.enc_rsvp) {
      rsvpData = await decryptJson(
        rsvpRow.enc_rsvp as string,
        env.KEK_B64,
        'rsvps',
        session.guest_id.toString(),
        'rsvp'
      ) as RSVP;
    } else if (guestProfile.rsvp) {
      rsvpData = guestProfile.rsvp;
    }

    if (rsvpData) {
      rsvpData = {
        ...rsvpData,
        partyResponses: normalizeRsvpPartyResponses(rsvpData.partyResponses)
      };
    }

    const event = await env.DB.prepare(
      'SELECT enc_details FROM event WHERE id = 1'
    ).first();

    if (!event) {
      return new Response('Event not found', { status: 500 }) as unknown as CfResponse;
    }

    const eventDetails = await decryptJson(
      event.enc_details as string,
      env.KEK_B64,
      'event',
      '1',
      'details'
    ) as EventDetails;

    const viewModel = buildEventViewModel(eventDetails, guestProfile, rsvpData);

    const nonce = ((context.data as any) && (context.data as any).nonce) as string;
    const html = renderEventPage(viewModel, nonce);

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html',
        'Cache-Control': 'no-store'
      }
    }) as unknown as CfResponse;

  } catch (error) {
    logError('event', error);
    return new Response('An error occurred', { status: 500 }) as unknown as CfResponse;
  }
};

function redirectToInvite(): CfResponse {
  return new Response(null, {
    status: 302,
    headers: {
      'Location': '/invite',
      'Cache-Control': 'no-store'
    }
  }) as unknown as CfResponse;
}

function buildEventViewModel(
  event: EventDetails,
  guestProfile: GuestProfile,
  rsvp: RSVP | undefined
): EventPageViewModel {
  const siteTitle = event.siteTitle?.trim() || 'Our Wedding';
  const heroHeadline = event.heroHeadline?.trim() || siteTitle;
  const dateText = formatDate(event.dateISO, event.timeZone);
  const defaultDeadlineText = event.rsvpDeadlineISO
    ? `RSVP by ${formatDate(event.rsvpDeadlineISO, event.timeZone)}`
    : undefined;

  const rsvpStatusMode = event.rsvpStatus?.mode === 'closed' ? 'closed' : 'open';
  const rsvpStatusMessage = event.rsvpStatus?.message?.trim() || undefined;

  const heroCtaText = rsvpStatusMode === 'closed'
    ? (rsvpStatusMessage || 'RSVPs are closed')
    : defaultDeadlineText;

  const partyMembers = buildPartyMemberView(guestProfile.party);
  const events = prepareEventsForGuest(
    event,
    guestProfile.party,
    rsvp?.partyResponses
  );
  const primaryVenue = events.find(item => item.locationName)?.locationName;

  const accommodations = buildAccommodations(event);
  const registry = buildRegistry(event);
  const hasChildPolicy = events.some(item => item.childPolicy);
  const normalizedLocalGuide = normalizeLocalGuideForView(event.localGuide);
  const normalizedTransportationGuide = normalizeTransportationGuideForView(event.transportationGuide);
  const normalizedCeremonyGuide = normalizeCeremonyGuideForView(event.ceremonyGuide);

  return {
    title: siteTitle,
    hero: {
      headline: heroHeadline,
      dateText,
      rsvpDeadlineText: heroCtaText,
      locationText: primaryVenue
    },
    guest: {
      greetingName: resolvePrimaryGreeting(guestProfile.party, siteTitle),
      partySummary: buildPartySummary(guestProfile.party),
      members: partyMembers
    },
    navigation: {
      showCeremony: Boolean(normalizedCeremonyGuide),
      showSchedule: events.length > 0,
      showTravel: Boolean(
        accommodations?.length ||
        normalizedLocalGuide ||
        normalizedTransportationGuide ||
        hasChildPolicy
      ),
      showRegistry: Boolean(registry?.length),
      showRsvp: true
    },
    timeZoneLabel: event.timeZone,
    ceremonyGuide: normalizedCeremonyGuide,
    localGuide: normalizedLocalGuide,
    transportationGuide: normalizedTransportationGuide,
    events,
    accommodations,
    registry,
    rsvp: {
      deadlineText: event.rsvpDeadlineISO ? formatDate(event.rsvpDeadlineISO, event.timeZone) : undefined,
      submittedAtText: rsvp?.submittedAt ? formatDateTime(rsvp.submittedAt, event.timeZone) : undefined,
      state: rsvpStatusMode,
      closedMessage: rsvpStatusMessage
    }
  };
}

function normalizeLocalGuideForView(input: LocalGuideSections | undefined): LocalGuideSections | undefined {
  if (!input) {
    return undefined;
  }

  const result: LocalGuideSections = {};
  (['eat', 'drink', 'see', 'do'] as Array<keyof LocalGuideSections>).forEach((key) => {
    const value = input[key];
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) {
        result[key] = trimmed;
      }
    }
  });

  return Object.keys(result).length ? result : undefined;
}

function normalizeTransportationGuideForView(
  input: TransportationSections | undefined
): TransportationSections | undefined {
  if (!input) {
    return undefined;
  }

  const result: TransportationSections = {};
  (['planes', 'trains', 'automobiles'] as Array<keyof TransportationSections>).forEach((key) => {
    const value = input[key];
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) {
        result[key] = trimmed;
      }
    }
  });

  return Object.keys(result).length ? result : undefined;
}

function normalizeCeremonyGuideForView(input: CeremonyGuideSections | undefined): CeremonyGuideSections | undefined {
  if (!input) {
    return undefined;
  }

  const result: CeremonyGuideSections = {};
  (['summary', 'quickGuide', 'stepByStep', 'rolesObjects', 'history', 'etiquetteFaq'] as Array<keyof CeremonyGuideSections>).forEach((key) => {
    const value = input[key];
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) {
        result[key] = trimmed;
      }
    }
  });

  return Object.keys(result).length ? result : undefined;
}

function formatDate(

  isoString: string | undefined,
  timeZone: string | undefined,
  opts: { uppercase?: boolean } = {}
): string {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    const formatted = date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: timeZone || 'UTC'
    });
    return opts.uppercase ? formatted.toUpperCase() : formatted;
  } catch {
    return isoString;
  }
}

function formatDateWithWeekday(
  isoString: string | undefined,
  timeZone: string | undefined
): string {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: timeZone || 'UTC'
    });
  } catch {
    return '';
  }
}

function formatTimeRange(
  startISO: string | undefined,
  endISO: string | undefined,
  timeZone: string | undefined
): string {
  if (!startISO) return '';
  try {
    const start = new Date(startISO);
    const startText = start.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timeZone || 'UTC'
    });
    if (!endISO) {
      return startText;
    }
    const end = new Date(endISO);
    const endText = end.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timeZone || 'UTC'
    });
    return `${startText} – ${endText}`;
  } catch {
    return '';
  }
}

function formatDateTime(
  isoString: string,
  timeZone: string | undefined
): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timeZone || 'UTC'
    });
  } catch {
    return isoString;
  }
}

function resolveAttendanceStatus(value: unknown): 'yes' | 'no' | 'pending' {
  if (value && typeof value === 'object') {
    const status = (value as Record<string, unknown>).status;
    if (status === 'yes' || status === 'no') {
      return status;
    }
    return 'pending';
  }
  if (value === 'yes' || value === 'no') {
    return value;
  }
  return 'pending';
}

function prepareEventsForGuest(
  event: EventDetails,
  party: PartyMember[],
  rsvpResponses: Record<string, PartyEventResponse> | undefined
): EventPageViewModel['events'] {
  if (!Array.isArray(event.events) || event.events.length === 0) {
    return [];
  }

  const responseMap = rsvpResponses ? new Map(Object.entries(rsvpResponses)) : new Map();

  const result: EventPageViewModel['events'] = [];
  for (const item of event.events) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    if (!id) {
      continue;
    }
    const invitedMembers = party.filter(member => {
      if (!Array.isArray(member.invitedEvents)) {
        return false;
      }
      return member.invitedEvents.map(eventId => eventId.trim()).includes(id);
    });

    if (invitedMembers.length === 0) {
      continue;
    }

    const label = typeof item.label === 'string' && item.label.trim()
      ? item.label.trim()
      : 'Event';

    const locationName = item.venue && typeof item.venue.name === 'string'
      ? item.venue.name.trim()
      : undefined;

    const locationGeo = item.venue && typeof item.venue.geo === 'string'
      ? item.venue.geo.trim() || undefined
      : undefined;

    const locationAddress = item.venue && Array.isArray(item.venue.address)
      ? item.venue.address
          .map(line => typeof line === 'string' ? line.trim() : '')
          .filter(Boolean)
      : undefined;

    const mapUrl = item.venue && typeof item.venue.mapUrl === 'string' && item.venue.mapUrl.trim()
      ? item.venue.mapUrl.trim()
      : undefined;

    const collectDietary = Boolean(item.collectDietaryNotes);
    const rawMealOptions = Array.isArray(item.mealOptions) ? item.mealOptions : undefined;
    const eventMealOptions = item.requiresMealSelection && rawMealOptions && rawMealOptions.length > 0
      ? [...rawMealOptions]
      : undefined;

    const attendees = invitedMembers.map(member => {
      const rsvpResponse = responseMap.get(member.personId);
      const rsvpMeals = rsvpResponse?.mealSelections;
      const rsvpDietary = rsvpResponse?.dietaryNotes;

      const mealChoice = member.mealSelections?.[id]
        || (rsvpMeals ? rsvpMeals[id] : undefined);

      let dietaryNote: string | undefined;
      if (collectDietary) {
        const note = (member.dietaryNotes?.[id] || rsvpDietary?.[id] || '').trim();
        dietaryNote = note ? note : undefined;
      }

      return {
        personId: member.personId,
        name: formatMemberName(member),
        role: member.role,
        attendanceStatus: resolveAttendanceStatus(member.attendance?.[id]),
        mealChoice,
        dietaryNote
      };
    });

    result.push({
      id,
      label,
      dateLabel: formatDateWithWeekday(item.startISO, event.timeZone),
      timeLabel: formatTimeRange(item.startISO, item.endISO, event.timeZone),
      locationName,
      locationGeo,
      locationAddress,
      mapUrl,
      dressCode: item.dressCode?.trim() || undefined,
      photoPolicy: item.photoPolicy?.trim() || undefined,
      accessibility: item.accessibility?.trim() || undefined,
      transportation: item.transportation?.trim() || undefined,
      foodNotes: item.foodNotes?.trim() || undefined,
      childPolicy: item.childPolicy?.trim() || undefined,
      additionalNotes: item.additionalNotes?.trim() || undefined,
      requiresMealSelection: Boolean(item.requiresMealSelection),
      mealOptions: eventMealOptions,
      collectDietaryNotes: collectDietary,
      attendees
    });
  }

  return result;
}

function buildAccommodations(event: EventDetails): EventPageViewModel['accommodations'] {
  if (!Array.isArray(event.accommodations) || event.accommodations.length === 0) {
    return undefined;
  }
  const items = event.accommodations
    .filter(item => item && typeof item === 'object')
    .map(item => ({
      name: item.name?.trim() || '',
      address: item.address?.trim() || '',
      discountCode: item.discountCode?.trim() || undefined,
      notes: item.notes?.trim() || undefined
    }))
    .filter(item => item.name && item.address);
  return items.length > 0 ? items : undefined;
}

function buildRegistry(event: EventDetails): EventPageViewModel['registry'] {
  if (!Array.isArray(event.registry) || event.registry.length === 0) {
    return undefined;
  }
  const items = event.registry
    .filter(item => item && typeof item === 'object')
    .map(item => ({
      label: item.label?.trim() || '',
      url: item.url?.trim() || '',
      description: item.description?.trim() || undefined
    }))
    .filter(item => item.label && item.url);
  return items.length > 0 ? items : undefined;
}

function buildPartySummary(party: PartyMember[]): string {
  const names = party
    .map(formatMemberName)
    .filter(Boolean);

  if (names.length === 0) {
    return 'Your party';
  }

  const lastUpdated = new Date().toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });

  return `${names.join(' + ')} • updated ${lastUpdated}`;
}

function buildPartyMemberView(
  party: PartyMember[]
): EventPageViewModel['guest']['members'] {
  return party.map(member => ({
    personId: member.personId,
    role: member.role,
    displayName: formatMemberName(member),
    invitedEvents: Array.isArray(member.invitedEvents)
      ? member.invitedEvents.map(eventId => eventId.trim()).filter(Boolean)
      : [],
    attendance: cloneAttendance(member.attendance),
    mealSelections: normalizeMealSelectionsForView(member.mealSelections)
  }));
}

function normalizeMealSelectionsForView(
  mealSelections: PartyMealSelectionMap | undefined
): Record<string, string> | undefined {
  if (!mealSelections) {
    return undefined;
  }
  const entries = Object.entries(mealSelections)
    .filter(([, value]) => typeof value === 'string' && value.trim())
    .map(([key, value]) => [key, (value as string).trim()]);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function resolvePrimaryGreeting(party: PartyMember[], fallback: string): string {
  const primary = party.find(member => member.role === 'primary');
  if (primary) {
    const name = (primary.firstName ?? '').trim();
    if (name) {
      return name;
    }
    const combined = formatMemberName(primary);
    if (combined) {
      return combined;
    }
  }
  return fallback;
}

function formatMemberName(member: PartyMember): string {
  return formatMemberDisplayName(member);
}

function normalizeRsvpPartyResponses(
  responses: Record<string, PartyEventResponse> | undefined
): Record<string, PartyEventResponse> {
  if (!responses) {
    return {};
  }

  const normalized: Record<string, PartyEventResponse> = {};
  for (const [personId, response] of Object.entries(responses)) {
    normalized[personId] = {
      events: cloneAttendance(response.events),
      mealSelections: cloneMealSelections(response.mealSelections),
      dietaryNotes: cloneDietaryNotes(response.dietaryNotes)
    };
  }

  return normalized;
}
