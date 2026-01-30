import type { PagesFunction, Response as CfResponse } from '@cloudflare/workers-types';
import { decryptJson, encryptJson, generateToken, hashToken } from '../../src/lib/crypto';
import { logError } from '../../src/lib/logger';
import { requireAccessAssertion } from '../../src/lib/access';
import { PayloadTooLargeError, readJsonWithinLimit } from '../../src/lib/request';
import { sendWeddingInvitation } from '../../src/lib/gmail';
import type {
  AttendanceRecord,
  Env,
  EventDetails,
  GuestProfile,
  PartyAttendanceMap,
  PartyMember,
  EventAttendanceStatus,
  PartyEventResponse
} from '../../src/types';
import {
  clearMealSelection,
  cloneAttendance,
  cloneAttendanceRecord,
  cloneDietaryNotes,
  cloneMealSelections,
  cloneParty,
  clonePendingMealSelections,
  createAttendanceRecord,
  normalizeGuestProfileAttendance,
  refreshPartyPendingMealSelections
} from '../../src/lib/party';
import {
  buildPartyMembers,
  migrateProfile,
  normalizeEventSelection,
  trimToString
} from './profileUtils';
import { loadEventSummaries } from './loadEventSummaries';

const syncMemberInvitations = (
  member: PartyMember,
  invitedEvents: string[]
): PartyMember => {
  const uniqueEvents = Array.from(new Set(invitedEvents));
  const attendance: PartyAttendanceMap = {};
  uniqueEvents.forEach(eventId => {
    const current = member.attendance?.[eventId];
    attendance[eventId] = current
      ? cloneAttendanceRecord(current)
      : createAttendanceRecord('pending', 'system', null);
  });

  const mealSelections = member.mealSelections
    ? Object.fromEntries(
        Object.entries(member.mealSelections).filter(([eventId]) => uniqueEvents.includes(eventId))
      )
    : undefined;

  const dietaryNotes = member.dietaryNotes
    ? Object.fromEntries(
        Object.entries(member.dietaryNotes)
          .filter(([eventId, value]) => uniqueEvents.includes(eventId) && typeof value === 'string')
          .map(([eventId, value]) => [eventId, (value as string).trim()])
          .filter(([, value]) => value.length > 0)
      )
    : undefined;

  return {
    ...member,
    invitedEvents: uniqueEvents,
    attendance,
    mealSelections: mealSelections && Object.keys(mealSelections).length > 0 ? mealSelections : undefined,
    dietaryNotes: dietaryNotes && Object.keys(dietaryNotes).length > 0 ? dietaryNotes : undefined,
    pendingMealSelections: clonePendingMealSelections(member.pendingMealSelections)
  };
};

const syncPartyInvitations = (
  party: PartyMember[],
  invitedEvents: string[]
): PartyMember[] => {
  return party.map(member => syncMemberInvitations(member, invitedEvents));
};

const attendanceKeyMatches = (member: PartyMember, personId: string | undefined): boolean => {
  if (!personId) {
    return true;
  }
  return member.personId === personId;
};

const createMealKey = (label: string): string => {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
};

const applyAttendanceToParty = (
  party: PartyMember[],
  eventId: string,
  status: EventAttendanceStatus,
  personId: string | undefined,
  updatedAt: number
): PartyMember[] => {
  return party.map(member => {
    if (!member.invitedEvents.includes(eventId) || !attendanceKeyMatches(member, personId)) {
      return member;
    }

    const previous = member.attendance?.[eventId] ?? createAttendanceRecord('pending', 'system', null);
    if (previous.status === status) {
      return member;
    }

    let nextMember: PartyMember = {
      ...member,
      attendance: {
        ...member.attendance,
        [eventId]: createAttendanceRecord(status, 'admin', updatedAt)
      }
    };

    if (status === 'no') {
      nextMember = clearMealSelection(nextMember, eventId);
    }

    return nextMember;
  });
};

const ensureGuestSlot = (
  party: PartyMember[],
  allowGuest: boolean
): PartyMember[] => {
  const hasGuest = party.some(member => member.role === 'guest');
  const hasNamedCompanion = party.some(member => member.role === 'companion' && (member.firstName || member.lastName));
  if (allowGuest) {
    if (hasGuest || hasNamedCompanion) {
      return party;
    }
    if (party.length >= 2) {
      return party;
    }
    const referenceEvents = party[0]?.invitedEvents ?? [];
    return [
      ...party,
      ...buildPartyMembers(
        { firstName: '', lastName: '' },
        undefined,
        true,
        referenceEvents
      ).filter(member => member.role === 'guest')
    ].slice(0, 2);
  }

  if (!hasGuest) {
    return party;
  }

  return party.filter(member => member.role !== 'guest');
};


const loadInviteEmailSubject = async (env: Env): Promise<string | undefined> => {
  const row = await env.DB.prepare(
    'SELECT enc_details FROM event WHERE id = 1'
  ).first();

  if (!row || !row.enc_details) {
    return undefined;
  }

  try {
    const details = await decryptJson(
      row.enc_details as string,
      env.KEK_B64,
      'event',
      '1',
      'details'
    ) as EventDetails;
    return details.inviteEmailSubject?.trim() || undefined;
  } catch (error) {
    logError('admin/guests/resend-subject', error);
    return undefined;
  }
};


// GET /admin/guests - List all guests with decrypted info
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  const authResult = await requireAccessAssertion(request, env);
  if (authResult instanceof Response) {
    return authResult as unknown as CfResponse;
  }

  try {
    const { events } = await loadEventSummaries(env);
    const mealRequirementMap = new Map(events.map(event => [event.id, Boolean(event.requiresMealSelection)]));
    const requiresMealSelection = (eventId: string): boolean => mealRequirementMap.get(eventId) === true;

    const guests = await env.DB.prepare(`
      SELECT
        g.id,
        g.email_hash,
        g.enc_profile,
        g.created_at,
        g.invite_sent_at,
        g.invite_clicked_at,
        g.registered_at,
        r.enc_rsvp,
        r.updated_at as rsvp_updated
      FROM guests g
      LEFT JOIN rsvps r ON r.guest_id = g.id
      ORDER BY g.created_at DESC
    `).all();

    const guestRows = (guests.results || []) as Array<Record<string, unknown>>;
    const guestIds = guestRows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id));

    let auditSummaries: Record<number, Record<string, { count: number; last: number | null }>> = {};
    let magicSummaries: Record<number, { issuedCount: number; lastIssued: number | null; usedCount: number; lastUsed: number | null }> = {};

    // D1 has a limit of 100 bound parameters per query, so batch guest IDs
    const D1_PARAM_LIMIT = 99;
    const guestIdChunks: number[][] = [];
    for (let i = 0; i < guestIds.length; i += D1_PARAM_LIMIT) {
      guestIdChunks.push(guestIds.slice(i, i + D1_PARAM_LIMIT));
    }

    if (guestIds.length > 0) {
      const nextAuditSummaries: Record<number, Record<string, { count: number; last: number | null }>> = {};
      for (const chunk of guestIdChunks) {
        const placeholders = chunk.map(() => '?').join(',');
        const auditResults = await env.DB.prepare(
          `SELECT guest_id, type, COUNT(*) as count, MAX(created_at) as last
           FROM audit_events
           WHERE guest_id IN (${placeholders})
           GROUP BY guest_id, type`
        ).bind(...chunk).all();

        for (const row of (auditResults.results || []) as Array<Record<string, unknown>>) {
          const guestIdRaw = row.guest_id;
          if (guestIdRaw === null || guestIdRaw === undefined) {
            continue;
          }
          const guestId = Number(guestIdRaw);
          if (!Number.isFinite(guestId)) {
            continue;
          }
          const type = String(row.type ?? 'unknown');
          const countRaw = Number(row.count ?? 0);
          const count = Number.isFinite(countRaw) ? countRaw : 0;
          const lastRaw = row.last;
          const lastNumber = lastRaw === null || lastRaw === undefined ? null : Number(lastRaw);
          const last = lastNumber !== null && Number.isFinite(lastNumber) ? lastNumber : null;
          if (!nextAuditSummaries[guestId]) {
            nextAuditSummaries[guestId] = {};
          }
          nextAuditSummaries[guestId][type] = {
            count,
            last
          };
        }
      }
      auditSummaries = nextAuditSummaries;

      const nextMagicSummaries: Record<number, { issuedCount: number; lastIssued: number | null; usedCount: number; lastUsed: number | null }> = {};
      for (const chunk of guestIdChunks) {
        const placeholders = chunk.map(() => '?').join(',');
        const magicResults = await env.DB.prepare(
          `SELECT
             guest_id,
             COUNT(*) as issued_count,
             MAX(issued_at) as last_issued,
             SUM(CASE WHEN used_at IS NOT NULL THEN 1 ELSE 0 END) as used_count,
             MAX(CASE WHEN used_at IS NOT NULL THEN used_at ELSE NULL END) as last_used
           FROM magic_links
           WHERE guest_id IN (${placeholders})
           GROUP BY guest_id`
        ).bind(...chunk).all();

        for (const row of (magicResults.results || []) as Array<Record<string, unknown>>) {
          const guestIdRaw = row.guest_id;
          if (guestIdRaw === null || guestIdRaw === undefined) {
            continue;
          }
          const guestId = Number(guestIdRaw);
          if (!Number.isFinite(guestId)) {
            continue;
          }
          const issuedRaw = Number(row.issued_count ?? 0);
          const usedRaw = Number(row.used_count ?? 0);
          const issuedCount = Number.isFinite(issuedRaw) ? issuedRaw : 0;
          const usedCount = Number.isFinite(usedRaw) ? usedRaw : 0;
          const lastIssuedCandidate = row.last_issued;
          const lastUsedCandidate = row.last_used;
          const lastIssuedNumber = lastIssuedCandidate === null || lastIssuedCandidate === undefined ? null : Number(lastIssuedCandidate);
          const lastUsedNumber = lastUsedCandidate === null || lastUsedCandidate === undefined ? null : Number(lastUsedCandidate);
          nextMagicSummaries[guestId] = {
            issuedCount,
            usedCount,
            lastIssued: lastIssuedNumber !== null && Number.isFinite(lastIssuedNumber) ? lastIssuedNumber : null,
            lastUsed: lastUsedNumber !== null && Number.isFinite(lastUsedNumber) ? lastUsedNumber : null
          };
        }
      }
      magicSummaries = nextMagicSummaries;
    }

    // Decrypt profiles for admin view
    const decryptedGuests = await Promise.all(
      guestRows.map(async (guest: any) => {
        const profile = migrateProfile(
          await decryptJson(
            guest.enc_profile as string,
            env.KEK_B64,
            'guests',
            (guest.email_hash as string),
            'profile'
          ),
          events
        );

        normalizeGuestProfileAttendance(profile);
        profile.party = refreshPartyPendingMealSelections(profile.party, requiresMealSelection);

        let rsvp = null;
        if (guest.enc_rsvp) {
          rsvp = await decryptJson(
            guest.enc_rsvp as string,
            env.KEK_B64,
            'rsvps',
            guest.id.toString(),
            'rsvp'
          );
        }

        if (rsvp && typeof rsvp === 'object' && rsvp.partyResponses && typeof rsvp.partyResponses === 'object') {
          const normalizedResponses: Record<string, PartyEventResponse> = {};
          for (const [personId, response] of Object.entries(rsvp.partyResponses as Record<string, PartyEventResponse>)) {
            normalizedResponses[personId] = {
              events: cloneAttendance(response.events),
              mealSelections: cloneMealSelections(response.mealSelections),
              dietaryNotes: cloneDietaryNotes(response.dietaryNotes),
              pendingMealSelections: clonePendingMealSelections(response.pendingMealSelections)
            };
          }
          rsvp = { ...rsvp, partyResponses: normalizedResponses };
        }

        const guestId = Number(guest.id);
        const audit = auditSummaries[guestId] || {};
        const magic = magicSummaries[guestId] || {
          issuedCount: 0,
          usedCount: 0,
          lastIssued: null,
          lastUsed: null
        };

        const party = cloneParty(profile.party || []);
        const invitedEventSet = new Set<string>();
        party.forEach(member => {
          member.invitedEvents.forEach(eventId => invitedEventSet.add(eventId));
        });

        const toTimestamp = (value: unknown, { allowNull = true }: { allowNull?: boolean } = {}): number | null => {
          if (value === null || value === undefined) {
            return allowNull ? null : 0;
          }
          if (typeof value === 'number') {
            return Number.isFinite(value) ? value : allowNull ? null : 0;
          }
          const parsed = Number(value);
          if (Number.isFinite(parsed)) {
            return parsed;
          }
          return allowNull ? null : 0;
        };

        const createdAt = toTimestamp(guest.created_at, { allowNull: false }) ?? 0;
        const inviteSentAt = toTimestamp(guest.invite_sent_at);
        const inviteClickedAt = toTimestamp(guest.invite_clicked_at);
        const registeredAt = toTimestamp(guest.registered_at);
        const rsvpUpdatedAt = toTimestamp(guest.rsvp_updated);

        return {
          id: guestId,
          email: profile.email,
          party,
          invitedEvents: Array.from(invitedEventSet),
          notes: profile.notes,
          phone: profile.phone,
          vip: profile.vip === true,
          inviteToken: profile.inviteToken,
          inviteSentAt,
          invite_sent_at: inviteSentAt,
          inviteClickedAt,
          invite_clicked_at: inviteClickedAt,
          registeredAt,
          registered_at: registeredAt,
          createdAt,
          created_at: createdAt,
          rsvp,
          rsvpUpdatedAt,
          activity: {
            audit,
            magicLinks: magic
          }
        };
      })
    );

    return new Response(JSON.stringify(decryptedGuests), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      }
    }) as unknown as CfResponse;

  } catch (error) {
    logError('admin/guests/get', error);
    return new Response('Internal error', { status: 500 }) as unknown as CfResponse;
  }
};

// POST /admin/guests - Update guest, resend invite, or update permissions
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  const authResult = await requireAccessAssertion(request, env);
  if (authResult instanceof Response) {
    return authResult as unknown as CfResponse;
  }

  try {
    const { data, bytes: _bytes } = await readJsonWithinLimit<unknown>(request, 32768);
    const { action, guestId, updates, visibility, attendance, meal } = (data || {}) as {
      action?: 'update' | 'resend' | 'updateEventVisibility' | 'updateEventAttendance' | 'updateMealSelection' | 'delete';
      guestId?: number;
      updates?: Record<string, unknown>;
      visibility?: Record<string, boolean>;
      attendance?: { eventId: string; status: EventAttendanceStatus; personId?: string };
      meal?: { eventId?: unknown; personId?: unknown; mealKey?: unknown };
    };

    const { events } = await loadEventSummaries(env);
    const mealRequirementMap = new Map(events.map(event => [event.id, Boolean(event.requiresMealSelection)]));
    const requiresMealSelection = (eventId: string): boolean => mealRequirementMap.get(eventId) === true;

    if (action === 'update' && guestId && updates) {
      // Get existing guest
      const guest = await env.DB.prepare(
        'SELECT enc_profile, email_hash FROM guests WHERE id = ?'
      ).bind(guestId).first();

      if (!guest) {
        return new Response('Guest not found', { status: 404 }) as unknown as CfResponse;
      }

      // Decrypt, update, re-encrypt
      const decrypted = await decryptJson(
        guest.enc_profile as string,
        env.KEK_B64,
        'guests',
        (guest.email_hash as string),
        'profile'
      );

      const profile = migrateProfile(decrypted, events);
      let nextProfile: GuestProfile = { ...profile, party: cloneParty(profile.party) };
      let didChange = false;

      if (Object.prototype.hasOwnProperty.call(updates, 'allowPlusOne')) {
        const allowGuest = updates.allowPlusOne === true;
        const adjustedParty = ensureGuestSlot(nextProfile.party, allowGuest);
        const partyChanged =
          adjustedParty.length !== nextProfile.party.length ||
          adjustedParty.some((member, index) => {
            const current = nextProfile.party[index];
            return !current || current.role !== member.role;
          });
        if (partyChanged) {
          nextProfile = { ...nextProfile, party: cloneParty(adjustedParty), rsvp: undefined };
          didChange = true;
        }
      }

      if (Object.prototype.hasOwnProperty.call(updates, 'notes')) {
        const value = updates.notes;
        if (typeof value === 'string') {
          nextProfile = { ...nextProfile, notes: value.trim() || undefined };
          didChange = true;
        }
      }

      if (Object.prototype.hasOwnProperty.call(updates, 'phone')) {
        const value = updates.phone;
        if (typeof value === 'string') {
          nextProfile = { ...nextProfile, phone: value.trim() || undefined };
          didChange = true;
        }
      }

      if (Object.prototype.hasOwnProperty.call(updates, 'vip')) {
        const value = updates.vip;
        if (typeof value === 'boolean') {
          nextProfile = { ...nextProfile, vip: value };
          didChange = true;
        }
      }

      if (!didChange) {
        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json' }
        }) as unknown as CfResponse;
      }

      nextProfile = {
        ...nextProfile,
        party: refreshPartyPendingMealSelections(nextProfile.party, requiresMealSelection)
      };

      const encProfile = await encryptJson(
        nextProfile,
        env.KEK_B64,
        'guests',
        (guest.email_hash as string),
        'profile'
      );

      await env.DB.prepare(
        'UPDATE guests SET enc_profile = ?, updated_at = ? WHERE id = ?'
      ).bind(encProfile, Math.floor(Date.now() / 1000), guestId).run();

      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      }) as unknown as CfResponse;
    }

    if (action === 'updateEventVisibility' && guestId && visibility) {
      // Get existing guest
      const guest = await env.DB.prepare(
        'SELECT enc_profile, email_hash FROM guests WHERE id = ?'
      ).bind(guestId).first();

      if (!guest) {
        return new Response('Guest not found', { status: 404 }) as unknown as CfResponse;
      }

      // Decrypt, update visibility, re-encrypt
      const decrypted = await decryptJson(
        guest.enc_profile as string,
        env.KEK_B64,
        'guests',
        (guest.email_hash as string),
        'profile'
      );

      const profile = migrateProfile(decrypted, events);
      const invitedEvents = normalizeEventSelection(visibility, events, { allowEmpty: true });
      const updatedParty = syncPartyInvitations(profile.party, invitedEvents);
      profile.party = cloneParty(updatedParty);
      profile.rsvp = undefined;
      profile.party = refreshPartyPendingMealSelections(profile.party, requiresMealSelection);

      const encProfile = await encryptJson(
        profile,
        env.KEK_B64,
        'guests',
        (guest.email_hash as string),
        'profile'
      );

      const now = Math.floor(Date.now() / 1000);

      await env.DB.prepare(
        'UPDATE guests SET enc_profile = ?, updated_at = ? WHERE id = ?'
      ).bind(encProfile, now, guestId).run();

      await env.DB.prepare(
        'INSERT INTO audit_events (guest_id, type, created_at) VALUES (?, ?, ?)'
      ).bind(guestId, 'event_visibility_updated', now).run();

      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      }) as unknown as CfResponse;
    }

    if (action === 'updateEventAttendance' && guestId && attendance) {
      const { eventId, status, personId } = attendance;
      if (!eventId || (status !== 'yes' && status !== 'no' && status !== 'pending')) {
        return new Response('Invalid attendance update', { status: 400 }) as unknown as CfResponse;
      }

      if (personId !== undefined && typeof personId !== 'string') {
        return new Response('Invalid attendee reference', { status: 400 }) as unknown as CfResponse;
      }

      const guest = await env.DB.prepare(
        'SELECT enc_profile, email_hash FROM guests WHERE id = ?'
      ).bind(guestId).first();

      if (!guest) {
        return new Response('Guest not found', { status: 404 }) as unknown as CfResponse;
      }

      const decrypted = await decryptJson(
        guest.enc_profile as string,
        env.KEK_B64,
        'guests',
        (guest.email_hash as string),
        'profile'
      );

      const profile = migrateProfile(decrypted, events);

      if (personId) {
        const memberExists = profile.party.some(member => member.personId === personId);
        if (!memberExists) {
          return new Response('Party member not found', { status: 404 }) as unknown as CfResponse;
        }
      }

      const updatedAt = Math.floor(Date.now() / 1000);

      profile.party = cloneParty(
        applyAttendanceToParty(profile.party, eventId, status, personId, updatedAt)
      );

      if (status === 'no' && personId && profile.rsvp?.partyResponses?.[personId]) {
        const response = profile.rsvp.partyResponses[personId];
        if (response.mealSelections) {
          delete response.mealSelections[eventId];
          if (Object.keys(response.mealSelections).length === 0) {
            delete response.mealSelections;
          }
        }

        if (response.pendingMealSelections) {
          response.pendingMealSelections = response.pendingMealSelections.filter((id) => id !== eventId);
          if (response.pendingMealSelections.length === 0) {
            delete response.pendingMealSelections;
          }
        }
      }
      profile.party = refreshPartyPendingMealSelections(profile.party, requiresMealSelection);

      const encProfile = await encryptJson(
        profile,
        env.KEK_B64,
        'guests',
        (guest.email_hash as string),
        'profile'
      );

      await env.DB.prepare(
        'UPDATE guests SET enc_profile = ?, updated_at = ? WHERE id = ?'
      ).bind(encProfile, updatedAt, guestId).run();

      await env.DB.prepare(
        'INSERT INTO audit_events (guest_id, type, created_at) VALUES (?, ?, ?)'
      ).bind(guestId, 'event_attendance_updated', updatedAt).run();

      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      }) as unknown as CfResponse;
    }

    if (action === 'updateMealSelection' && guestId && meal) {
      const eventId = typeof meal.eventId === 'string' ? meal.eventId.trim() : '';
      const personId = typeof meal.personId === 'string' ? meal.personId.trim() : '';
      const mealKeyRaw = meal.mealKey;

      if (!eventId || !personId) {
        return new Response('Invalid meal update payload', { status: 400 }) as unknown as CfResponse;
      }

      if (mealKeyRaw !== null && typeof mealKeyRaw !== 'string') {
        return new Response('Invalid meal option', { status: 400 }) as unknown as CfResponse;
      }

      const mealKey = typeof mealKeyRaw === 'string' ? mealKeyRaw.trim() : null;

      const eventDefinition = events.find((event) => event.id === eventId);
      if (!eventDefinition) {
        return new Response('Event not found', { status: 404 }) as unknown as CfResponse;
      }

      let resolvedMealValue: string | null = null;
      if (mealKey !== null) {
        const options = Array.isArray(eventDefinition.mealOptions) ? eventDefinition.mealOptions : [];
        const lookup = new Map<string, string>();
        options.forEach((option) => {
          if (typeof option !== 'string') {
            return;
          }
          const trimmed = option.trim();
          if (!trimmed) {
            return;
          }
          lookup.set(createMealKey(trimmed), trimmed);
        });

        resolvedMealValue = lookup.get(mealKey) ?? null;
        if (!resolvedMealValue) {
          return new Response('Invalid meal option', { status: 400 }) as unknown as CfResponse;
        }
      }

      const guest = await env.DB.prepare(
        'SELECT enc_profile, email_hash FROM guests WHERE id = ?'
      ).bind(guestId).first();

      if (!guest) {
        return new Response('Guest not found', { status: 404 }) as unknown as CfResponse;
      }

      const decrypted = await decryptJson(
        guest.enc_profile as string,
        env.KEK_B64,
        'guests',
        (guest.email_hash as string),
        'profile'
      );

      const profile = migrateProfile(decrypted, events);

      const memberIndex = profile.party.findIndex((member) => member.personId === personId);
      if (memberIndex === -1) {
        return new Response('Party member not found', { status: 404 }) as unknown as CfResponse;
      }

      const partyWithMeals = profile.party.map((member) => {
        if (member.personId !== personId) {
          return member;
        }

        if (!member.invitedEvents.includes(eventId)) {
          return member;
        }

        if (resolvedMealValue === null) {
          return clearMealSelection(member, eventId);
        }

        const nextMeals = member.mealSelections ? { ...member.mealSelections } : {};
        nextMeals[eventId] = resolvedMealValue;
        const nextPending = member.pendingMealSelections?.filter((id) => id !== eventId);

        return {
          ...member,
          mealSelections: Object.keys(nextMeals).length > 0 ? nextMeals : undefined,
          pendingMealSelections: nextPending && nextPending.length > 0 ? nextPending : undefined
        };
      });

      profile.party = cloneParty(partyWithMeals);
      profile.party = refreshPartyPendingMealSelections(profile.party, requiresMealSelection);

      if (profile.rsvp?.partyResponses?.[personId]) {
        const response = profile.rsvp.partyResponses[personId];
        if (resolvedMealValue === null) {
          if (response.mealSelections) {
            delete response.mealSelections[eventId];
            if (Object.keys(response.mealSelections).length === 0) {
              delete response.mealSelections;
            }
          }
        } else {
          if (!response.mealSelections) {
            response.mealSelections = {};
          }
          response.mealSelections[eventId] = resolvedMealValue;
        }

        const updatedMember = profile.party.find((member) => member.personId === personId);
        if (updatedMember?.pendingMealSelections && updatedMember.pendingMealSelections.length > 0) {
          response.pendingMealSelections = clonePendingMealSelections(updatedMember.pendingMealSelections);
        } else if (response.pendingMealSelections) {
          delete response.pendingMealSelections;
        }
      }

      const now = Math.floor(Date.now() / 1000);

      const encProfile = await encryptJson(
        profile,
        env.KEK_B64,
        'guests',
        (guest.email_hash as string),
        'profile'
      );

      await env.DB.prepare(
        'UPDATE guests SET enc_profile = ?, updated_at = ? WHERE id = ?'
      ).bind(encProfile, now, guestId).run();

      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      }) as unknown as CfResponse;
    }

    if (action === 'resend' && guestId) {
      const guest = await env.DB.prepare(
        'SELECT enc_profile, email_hash, invite_token_hash FROM guests WHERE id = ?'
      ).bind(guestId).first();

      if (!guest) {
        return new Response('Guest not found', { status: 404 }) as unknown as CfResponse;
      }

      const now = Math.floor(Date.now() / 1000);
      const emailHash = guest.email_hash as string;
      const decrypted = await decryptJson(
        guest.enc_profile as string,
        env.KEK_B64,
        'guests',
        emailHash,
        'profile'
      );

      const profile = migrateProfile(decrypted, events);
      const party = cloneParty(profile.party);

      if (!profile.email) {
        return new Response('Guest email missing', { status: 400 }) as unknown as CfResponse;
      }

      let inviteToken = profile.inviteToken;
      if (!inviteToken || inviteToken === 'missing') {
        inviteToken = generateToken();
        profile.inviteToken = inviteToken;
      }

      const inviteTokenHash = await hashToken(inviteToken, env.KEK_B64);
      const trackingUrl = `${env.APP_BASE_URL}/invite?t=${inviteToken}`;

      const inviteEmailSubject = await loadInviteEmailSubject(env);

      await sendWeddingInvitation(env, profile.email, party, trackingUrl, inviteEmailSubject);

      profile.inviteSentAt = now;
      profile.party = refreshPartyPendingMealSelections(profile.party, requiresMealSelection);

      const encProfile = await encryptJson(
        profile,
        env.KEK_B64,
        'guests',
        emailHash,
        'profile'
      );

      await env.DB.prepare(
        'UPDATE guests SET enc_profile = ?, invite_token_hash = ?, invite_sent_at = ?, invite_clicked_at = NULL, updated_at = ? WHERE id = ?'
      ).bind(encProfile, inviteTokenHash, now, now, guestId).run();

      await env.DB.prepare(
        'INSERT INTO audit_events (guest_id, type, created_at) VALUES (?, ?, ?)'
      ).bind(guestId, 'invite_sent', now).run();

      return new Response(JSON.stringify({ success: true, message: 'Invite resent' }), {
        headers: { 'Content-Type': 'application/json' }
      }) as unknown as CfResponse;
    }

    if (action === 'delete' && guestId) {
      const guest = await env.DB.prepare(
        'SELECT id FROM guests WHERE id = ?'
      ).bind(guestId).first();

      if (!guest) {
        return new Response('Guest not found', { status: 404 }) as unknown as CfResponse;
      }

      const now = Math.floor(Date.now() / 1000);

      await env.DB.prepare(
        'INSERT INTO audit_events (guest_id, type, created_at) VALUES (?, ?, ?)'
      ).bind(guestId, 'guest_deleted', now).run();

      await env.DB.prepare('DELETE FROM guests WHERE id = ?').bind(guestId).run();

      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      }) as unknown as CfResponse;
    }

    return new Response('Invalid action', { status: 400 }) as unknown as CfResponse;

  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return new Response(JSON.stringify({ error: 'Payload too large' }), {
        status: 413,
        headers: { 'Content-Type': 'application/json' }
      }) as unknown as CfResponse;
    }
    logError('admin/guests/post', error);
    return new Response('Internal error', { status: 500 }) as unknown as CfResponse;
  }
};
