import type {
  AttendanceRecord,
  AttendanceSource,
  EventAttendanceStatus,
  GuestProfile,
  PartyAttendanceMap,
  PartyMember,
  PartyMealSelectionMap
} from '../types';

export function cloneAttendance(attendance: PartyAttendanceMap | undefined): PartyAttendanceMap {
  if (!attendance || typeof attendance !== 'object') {
    return {};
  }
  return Object.fromEntries(
    Object.entries(attendance).map(([eventId, record]) => [
      eventId,
      cloneAttendanceRecord(record)
    ])
  );
}

export function cloneAttendanceRecord(
  record: AttendanceRecord | EventAttendanceStatus | undefined,
  fallbackSource: AttendanceSource = 'system'
): AttendanceRecord {
  if (!record || typeof record !== 'object') {
    return createAttendanceRecord(normalizeStatus(record), fallbackSource, null);
  }

  const status = normalizeStatus(record.status);
  const source = normalizeSource(record.source, fallbackSource);
  const updatedAt = typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt)
    ? record.updatedAt
    : null;

  return createAttendanceRecord(status, source, updatedAt);
}

export function createAttendanceRecord(
  status: EventAttendanceStatus,
  source: AttendanceSource,
  updatedAt: number | null
): AttendanceRecord {
  return { status, source, updatedAt };
}

function normalizeStatus(value: unknown): EventAttendanceStatus {
  if (value === 'yes' || value === 'no') {
    return value;
  }
  return 'pending';
}

function normalizeSource(value: unknown, fallback: AttendanceSource): AttendanceSource {
  if (value === 'guest' || value === 'admin' || value === 'system') {
    return value;
  }
  return fallback;
}

export function cloneMealSelections(
  mealSelections: PartyMealSelectionMap | undefined
): PartyMealSelectionMap | undefined {
  if (!mealSelections) {
    return undefined;
  }
  return Object.fromEntries(Object.entries(mealSelections)) as PartyMealSelectionMap;
}

export function clonePendingMealSelections(
  pending: string[] | undefined
): string[] | undefined {
  if (!Array.isArray(pending)) {
    return undefined;
  }
  const normalized = pending
    .map(eventId => (typeof eventId === 'string' ? eventId.trim() : ''))
    .filter(Boolean);
  return normalized.length > 0 ? Array.from(new Set(normalized)) : undefined;
}

export function clearMealSelection(member: PartyMember, eventId: string): PartyMember {
  const nextMeals = member.mealSelections ? { ...member.mealSelections } : undefined;
  if (nextMeals) {
    delete nextMeals[eventId];
  }

  const nextPending = member.pendingMealSelections?.filter((id) => id !== eventId);

  return {
    ...member,
    mealSelections: nextMeals && Object.keys(nextMeals).length > 0 ? nextMeals : undefined,
    pendingMealSelections: nextPending && nextPending.length > 0 ? nextPending : undefined
  };
}

export function cloneDietaryNotes(
  dietaryNotes: Record<string, string> | undefined
): Record<string, string> | undefined {
  if (!dietaryNotes) {
    return undefined;
  }
  return Object.fromEntries(Object.entries(dietaryNotes)) as Record<string, string>;
}

export function computePendingMealSelections(
  invitedEvents: string[],
  attendance: PartyAttendanceMap,
  mealSelections: PartyMealSelectionMap | undefined,
  requiresMealSelection: (eventId: string) => boolean
): string[] | undefined {
  const pending = invitedEvents
    .map(eventId => (typeof eventId === 'string' ? eventId.trim() : ''))
    .filter(eventId => {
      if (!eventId) return false;
      if (!requiresMealSelection(eventId)) return false;
      const record = attendance?.[eventId];
      if (!record || record.status !== 'yes') return false;
      return !mealSelections || !mealSelections[eventId];
    });

  return pending.length > 0 ? Array.from(new Set(pending)) : undefined;
}

export function refreshPartyPendingMealSelections(
  party: PartyMember[],
  requiresMealSelection: (eventId: string) => boolean
): PartyMember[] {
  return party.map(member => {
    const pending = computePendingMealSelections(
      member.invitedEvents,
      member.attendance,
      member.mealSelections,
      requiresMealSelection
    );
    return {
      ...member,
      pendingMealSelections: clonePendingMealSelections(pending)
    };
  });
}

export function clonePartyMember(member: PartyMember): PartyMember {
  return {
    ...member,
    invitedEvents: [...member.invitedEvents],
    attendance: cloneAttendance(member.attendance),
    mealSelections: cloneMealSelections(member.mealSelections),
    dietaryNotes: cloneDietaryNotes(member.dietaryNotes),
    pendingMealSelections: clonePendingMealSelections(member.pendingMealSelections)
  };
}

export function cloneParty(party: PartyMember[]): PartyMember[] {
  return party.map(clonePartyMember);
}

export function normalizeGuestProfileAttendance(profile: GuestProfile): void {
  if (!Array.isArray(profile.party)) {
    profile.party = [];
    return;
  }

  const responseMap = profile.rsvp?.partyResponses;

  profile.party = profile.party.map(member => {
    const invitedEvents = Array.isArray(member.invitedEvents)
      ? member.invitedEvents
          .map(eventId => (typeof eventId === 'string' ? eventId.trim() : ''))
          .filter(Boolean)
      : [];

    const attendanceSource = member.attendance && typeof member.attendance === 'object'
      ? member.attendance as Record<string, AttendanceRecord | EventAttendanceStatus>
      : {};

    const attendance: PartyAttendanceMap = {};
    invitedEvents.forEach(eventId => {
      attendance[eventId] = cloneAttendanceRecord(attendanceSource[eventId]);
    });

    const pendingSource = clonePendingMealSelections(member.pendingMealSelections);
    const pendingMealSelections = pendingSource
      ? pendingSource.filter(eventId => invitedEvents.includes(eventId))
      : undefined;

    const normalizedMember: PartyMember = {
      ...member,
      invitedEvents,
      attendance,
      mealSelections: cloneMealSelections(member.mealSelections),
      dietaryNotes: cloneDietaryNotes(member.dietaryNotes),
      pendingMealSelections
    };

    if (responseMap && responseMap[member.personId]) {
      responseMap[member.personId].events = cloneAttendance(attendance);
      responseMap[member.personId].pendingMealSelections = clonePendingMealSelections(pendingMealSelections);
    }

    return normalizedMember;
  });

  if (responseMap) {
    const memberIds = new Set(profile.party.map(member => member.personId));
    for (const [personId, response] of Object.entries(responseMap)) {
      if (!memberIds.has(personId)) {
        continue;
      }
      response.events = cloneAttendance(response.events);
      response.pendingMealSelections = clonePendingMealSelections(response.pendingMealSelections);
    }
  }
}
