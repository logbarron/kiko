import type {
  AttendanceRecord,
  AttendanceSource,
  EventAttendanceStatus,
  GuestProfile,
  PartyAttendanceMap,
  PartyMealSelectionMap,
  PartyMember,
  PartyRole
} from '../../src/types';
import { MAX_PARTY_SIZE } from '../../src/types';
import { createAttendanceRecord, cloneAttendanceRecord, refreshPartyPendingMealSelections } from '../../src/lib/party';

enum PartyIdentifiers {
  Primary = 'primary',
  Companion = 'companion',
  Guest = 'guest'
}

export const PRIMARY_ID = PartyIdentifiers.Primary;
export const COMPANION_ID = PartyIdentifiers.Companion;
export const GUEST_ID = PartyIdentifiers.Guest;

export interface EventSummary {
  id: string;
  label: string;
  requiresMealSelection?: boolean;
  mealOptions?: string[];
}

export const trimToString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

interface NormalizeEventSelectionOptions {
  allowEmpty?: boolean;
}

export const normalizeEventSelection = (
  raw: Record<string, unknown> | undefined,
  events: EventSummary[],
  options: NormalizeEventSelectionOptions = {}
): string[] => {
  const { allowEmpty = false } = options;
  if (events.length === 0) {
    return [];
  }
  const source = raw && typeof raw === 'object' ? raw : {};
  const selected = events
    .filter(event => source[event.id] === true)
    .map(event => event.id);
  if (selected.length > 0) {
    return Array.from(new Set(selected));
  }
  if (allowEmpty) {
    return [];
  }
  return events.map(event => event.id);
};

const buildInitialAttendance = (eventIds: string[]): PartyAttendanceMap => {
  return eventIds.reduce<PartyAttendanceMap>((acc, eventId) => {
    acc[eventId] = createAttendanceRecord('pending', 'system', null);
    return acc;
  }, {});
};

const createPartyMember = (
  personId: string,
  role: PartyRole,
  firstName: string,
  lastName: string,
  invitedEvents: string[]
): PartyMember => ({
  personId,
  role,
  firstName,
  lastName,
  invitedEvents,
  attendance: buildInitialAttendance(invitedEvents)
});

export const buildPartyMembers = (
  primary: { firstName: string; lastName: string },
  companion: { firstName: string; lastName: string } | undefined,
  allowGuest: boolean,
  invitedEvents: string[]
): PartyMember[] => {
  const uniqueEvents = Array.from(new Set(invitedEvents));
  const party: PartyMember[] = [
    createPartyMember(PRIMARY_ID, 'primary', primary.firstName, primary.lastName, uniqueEvents)
  ];

  if (companion) {
    party.push(
      createPartyMember(COMPANION_ID, 'companion', companion.firstName, companion.lastName, uniqueEvents)
    );
  } else if (allowGuest) {
    party.push(createPartyMember(GUEST_ID, 'guest', '', '', uniqueEvents));
  }

  return party.slice(0, MAX_PARTY_SIZE);
};

const normalizeInvitedEvents = (
  rawInvitedEvents: unknown,
  allowedEventIds: Set<string>,
  fallback: string[],
  allowEmpty: boolean
): string[] => {
  if (Array.isArray(rawInvitedEvents)) {
    const filtered = rawInvitedEvents
      .filter(item => typeof item === 'string')
      .map(item => item.trim())
      .filter(item => item && allowedEventIds.has(item));
    if (filtered.length > 0) {
      return Array.from(new Set(filtered));
    }
    if (allowEmpty) {
      return [];
    }
  }
  if (fallback.length > 0) {
    return Array.from(new Set(fallback.filter(id => allowedEventIds.has(id))));
  }
  return Array.from(allowedEventIds);
};

const normalizeAttendanceMap = (
  rawAttendance: unknown,
  invitedEvents: string[],
  fallbackSource: AttendanceSource = 'system'
): PartyAttendanceMap => {
  const map: PartyAttendanceMap = {};
  const source = rawAttendance && typeof rawAttendance === 'object'
    ? rawAttendance as Record<string, unknown>
    : {};

  for (const eventId of invitedEvents) {
    map[eventId] = normalizeAttendanceRecord(source[eventId], fallbackSource);
  }

  return map;
};

const normalizeAttendanceRecord = (
  rawValue: unknown,
  fallbackSource: AttendanceSource
): AttendanceRecord => {
  if (rawValue && typeof rawValue === 'object') {
    return cloneAttendanceRecord(rawValue as AttendanceRecord, fallbackSource);
  }

  const status = normalizeAttendanceStatus(rawValue);
  return createAttendanceRecord(status, fallbackSource, null);
};

const normalizeAttendanceStatus = (value: unknown): EventAttendanceStatus => {
  if (value === 'yes' || value === 'no') {
    return value;
  }
  return 'pending';
};

const normalizeMealSelections = (
  rawMeals: unknown,
  invitedEvents: string[]
): PartyMealSelectionMap | undefined => {
  if (!rawMeals || typeof rawMeals !== 'object') {
    return undefined;
  }
  const allowed = new Set(invitedEvents);
  const result: Record<string, string> = {};
  for (const [eventId, choice] of Object.entries(rawMeals as Record<string, unknown>)) {
    if (!allowed.has(eventId)) {
      continue;
    }
    if (typeof choice === 'string' && choice.trim()) {
      result[eventId] = choice.trim();
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
};

const normalizePartyMember = (
  rawMember: any,
  index: number,
  events: EventSummary[],
  fallbackEvents: string[]
): PartyMember | null => {
  if (!rawMember || typeof rawMember !== 'object') {
    return null;
  }

  const allowedIds = new Set(events.map(event => event.id));
  const defaultPersonId = index === 0 ? PRIMARY_ID : index === 1 ? COMPANION_ID : `${GUEST_ID}-${index}`;
  const rawPersonId = typeof rawMember.personId === 'string' ? rawMember.personId.trim() : '';
  const personId = rawPersonId || defaultPersonId;

  const rawRole = rawMember.role;
  const role: PartyRole = rawRole === 'primary' || rawRole === 'companion' || rawRole === 'guest'
    ? rawRole
    : personId === PRIMARY_ID
      ? 'primary'
      : personId === COMPANION_ID
        ? 'companion'
        : 'guest';

  const firstName = trimToString(rawMember.firstName);
  const lastName = trimToString(rawMember.lastName);

  const allowEmptyFallback = fallbackEvents.length === 0;
  const invitedEvents = normalizeInvitedEvents(
    rawMember.invitedEvents,
    allowedIds,
    fallbackEvents,
    allowEmptyFallback
  );

  const attendance = normalizeAttendanceMap(rawMember.attendance, invitedEvents);
  const mealSelections = normalizeMealSelections(rawMember.mealSelections, invitedEvents);

  return {
    personId,
    role,
    firstName,
    lastName,
    invitedEvents,
    attendance,
    mealSelections
  };
};

export const migrateProfile = (raw: any, events: EventSummary[]): GuestProfile => {
  const fallbackEvents = events.map(event => event.id);
  const mealRequirementMap = new Map(events.map(event => [event.id, Boolean(event.requiresMealSelection)]));
  const requiresMealSelection = (eventId: string): boolean => mealRequirementMap.get(eventId) === true;
  const baseProfile: GuestProfile = {
    email: typeof raw?.email === 'string' ? raw.email : '',
    party: [],
    phone: typeof raw?.phone === 'string' ? raw.phone : undefined,
    notes: typeof raw?.notes === 'string' ? raw.notes : undefined,
    vip: raw?.vip === true,
    inviteToken: typeof raw?.inviteToken === 'string' ? raw.inviteToken : undefined,
    inviteSentAt: typeof raw?.inviteSentAt === 'number' ? raw.inviteSentAt : undefined,
    inviteClickedAt: typeof raw?.inviteClickedAt === 'number' ? raw.inviteClickedAt : undefined,
    registeredAt: typeof raw?.registeredAt === 'number' ? raw.registeredAt : undefined,
    magic_link_sent_at: typeof raw?.magic_link_sent_at === 'number' ? raw.magic_link_sent_at : undefined,
    rsvp: raw?.rsvp
  };

  if (Array.isArray(raw?.party)) {
    const visibilityFallback = normalizeEventSelection(
      raw?.eventVisibility as Record<string, unknown> | undefined,
      events,
      { allowEmpty: true }
    );
    const normalizedParty: PartyMember[] = [];
    raw.party.forEach((member: any, index: number) => {
      if (normalizedParty.length >= MAX_PARTY_SIZE) {
        return;
      }
      const normalized = normalizePartyMember(member, index, events, visibilityFallback);
      if (normalized) {
        normalizedParty.push(normalized);
      }
    });
    const baseParty = normalizedParty.length > 0
      ? normalizedParty
      : buildPartyMembers({ firstName: '', lastName: '' }, undefined, false, fallbackEvents);
    baseProfile.party = refreshPartyPendingMealSelections(baseParty, requiresMealSelection);
    return baseProfile;
  }

  const legacyPrimaryFirst = trimToString(raw?.primaryGuest?.firstName ?? raw?.firstName);
  const legacyPrimaryLast = trimToString(raw?.primaryGuest?.lastName ?? raw?.lastName);
  const legacyCompanionFirst = trimToString(raw?.companion?.firstName);
  const legacyCompanionLast = trimToString(raw?.companion?.lastName);
  const invitedEventIds = normalizeEventSelection(
    raw?.eventVisibility as Record<string, unknown> | undefined,
    events,
    { allowEmpty: true }
  );
  const allowGuest = !legacyCompanionFirst && !legacyCompanionLast && raw?.allowPlusOne === true;

  const party = buildPartyMembers(
    { firstName: legacyPrimaryFirst, lastName: legacyPrimaryLast },
    legacyCompanionFirst || legacyCompanionLast
      ? { firstName: legacyCompanionFirst, lastName: legacyCompanionLast }
      : undefined,
    allowGuest,
    invitedEventIds
  );

  const legacyAttendanceSource = raw?.eventAttendance && typeof raw?.eventAttendance === 'object'
    ? raw.eventAttendance as Record<string, unknown>
    : undefined;

  if (legacyAttendanceSource) {
    party.forEach(member => {
      member.invitedEvents.forEach(eventId => {
        const value = legacyAttendanceSource[eventId];
        if (value === 'yes' || value === 'no') {
          member.attendance[eventId] = createAttendanceRecord(value, 'system', null);
        }
      });
    });
  }

  baseProfile.party = refreshPartyPendingMealSelections(party, requiresMealSelection);
  return baseProfile;
};
