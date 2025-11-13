// ABOUTME: Checks guest party normalization helpers.
// ABOUTME: Guards meal selection logic and attendance conversions.

import { describe, it, expect } from 'vitest';

import {
  clearMealSelection,
  computePendingMealSelections,
  createAttendanceRecord,
  normalizeGuestProfileAttendance,
  refreshPartyPendingMealSelections
} from '../../../src/lib/party';
import type { GuestProfile, PartyAttendanceMap, PartyMember } from '../../../src/types';

describe('normalizeGuestProfileAttendance', () => {
  it('converts legacy string attendance into structured records for party members and RSVP responses', () => {
    const profile: GuestProfile = {
      email: 'guest@example.com',
      party: [
        {
          personId: 'primary',
          role: 'primary',
          firstName: 'Taylor',
          lastName: 'Guest',
          invitedEvents: ['welcome', 'ceremony'],
          attendance: {
            welcome: 'yes' as any,
            ceremony: 'pending' as any
          },
          mealSelections: undefined,
          dietaryNotes: undefined
        },
        {
          personId: 'companion',
          role: 'companion',
          firstName: 'Jordan',
          lastName: 'Guest',
          invitedEvents: ['ceremony'],
          attendance: {
            ceremony: 'no' as any
          },
          mealSelections: undefined,
          dietaryNotes: undefined
        }
      ],
      rsvp: {
        partyResponses: {
          primary: {
            events: {
              welcome: 'yes' as any
            }
          },
          companion: {
            events: {
              ceremony: 'no' as any
            }
          }
        }
      }
    } as GuestProfile;

    normalizeGuestProfileAttendance(profile);

    const primary = profile.party[0];
    const companion = profile.party[1];

    expect(primary.attendance.welcome).toEqual({ status: 'yes', source: 'system', updatedAt: null });
    expect(primary.attendance.ceremony).toEqual({ status: 'pending', source: 'system', updatedAt: null });
    expect(companion.attendance.ceremony).toEqual({ status: 'no', source: 'system', updatedAt: null });

    expect(profile.rsvp?.partyResponses?.primary?.events?.welcome).toEqual({
      status: 'yes',
      source: 'system',
      updatedAt: null
    });
    expect(profile.rsvp?.partyResponses?.companion?.events?.ceremony).toEqual({
      status: 'no',
      source: 'system',
      updatedAt: null
    });
  });

  it('drops pending meal selections that are not for invited events', () => {
    const profile: GuestProfile = {
      email: 'guest@example.com',
      party: [
        {
          personId: 'primary',
          role: 'primary',
          firstName: 'Taylor',
          lastName: 'Guest',
          invitedEvents: ['ceremony'],
          attendance: {
            ceremony: createAttendanceRecord('yes', 'system', null)
          },
          mealSelections: undefined,
          dietaryNotes: undefined,
          pendingMealSelections: ['ceremony', 'invalid']
        }
      ],
      rsvp: {
        partyResponses: {
          primary: {
            events: {
              ceremony: createAttendanceRecord('yes', 'system', null)
            },
            pendingMealSelections: ['ceremony', 'invalid']
          }
        }
      }
    } as GuestProfile;

    normalizeGuestProfileAttendance(profile);

    expect(profile.party[0].pendingMealSelections).toEqual(['ceremony']);
    expect(profile.rsvp?.partyResponses?.primary?.pendingMealSelections).toEqual(['ceremony']);
  });

  it('computes pending meal selections when attendance is yes and no choice provided', () => {
    const attendance: PartyAttendanceMap = {
      reception: createAttendanceRecord('yes', 'guest', null)
    };

    const pending = computePendingMealSelections(
      ['reception'],
      attendance,
      undefined,
      (eventId) => eventId === 'reception'
    );

    expect(pending).toEqual(['reception']);
  });
});

describe('clearMealSelection', () => {
  it('removes meal selection and pending entry for a declined event', () => {
    const member = {
      personId: 'primary',
      role: 'primary',
      firstName: 'Taylor',
      lastName: 'Guest',
      invitedEvents: ['reception'],
      attendance: {
        reception: createAttendanceRecord('no', 'admin', 1)
      },
      mealSelections: {
        reception: 'chicken'
      },
      pendingMealSelections: ['reception']
    } as PartyMember;

    const cleared = clearMealSelection(member, 'reception');

    expect(cleared.mealSelections).toBeUndefined();
    expect(cleared.pendingMealSelections).toBeUndefined();

    const refreshed = refreshPartyPendingMealSelections([cleared], () => true);
    expect(refreshed[0].pendingMealSelections).toBeUndefined();
  });

  it('preserves other selections when clearing a single event', () => {
    const member = {
      personId: 'primary',
      role: 'primary',
      firstName: 'Taylor',
      lastName: 'Guest',
      invitedEvents: ['reception', 'brunch'],
      attendance: {
        reception: createAttendanceRecord('no', 'admin', 1),
        brunch: createAttendanceRecord('yes', 'guest', 1)
      },
      mealSelections: {
        reception: 'chicken',
        brunch: 'waffles'
      },
      pendingMealSelections: ['reception', 'brunch']
    } as PartyMember;

    const cleared = clearMealSelection(member, 'reception');

    expect(cleared.mealSelections).toEqual({ brunch: 'waffles' });
    expect(cleared.pendingMealSelections).toEqual(['brunch']);
  });
});

describe('refreshPartyPendingMealSelections', () => {
  it('recomputes pending selections for each member independently', () => {
    const members: PartyMember[] = [
      {
        personId: 'primary',
        role: 'primary',
        firstName: 'Taylor',
        lastName: 'Guest',
        invitedEvents: ['reception', 'brunch'],
        attendance: {
          reception: createAttendanceRecord('yes', 'guest', null),
          brunch: createAttendanceRecord('yes', 'guest', null)
        },
        mealSelections: {
          brunch: 'waffles'
        },
        pendingMealSelections: ['brunch']
      },
      {
        personId: 'companion',
        role: 'companion',
        firstName: 'Jordan',
        lastName: 'Guest',
        invitedEvents: ['reception'],
        attendance: {
          reception: createAttendanceRecord('pending', 'guest', null)
        },
        mealSelections: undefined,
        pendingMealSelections: ['reception', 'reception']
      }
    ];

    const requiresMealSelection = (eventId: string) => eventId === 'reception';

    const refreshed = refreshPartyPendingMealSelections(members, requiresMealSelection);

    expect(refreshed[0].pendingMealSelections).toEqual(['reception']);
    expect(refreshed[1].pendingMealSelections).toBeUndefined();
  });

  it('handles unicode event identifiers and meal labels', () => {
    const members: PartyMember[] = [
      {
        personId: 'primary',
        role: 'primary',
        firstName: 'Anaïs',
        lastName: 'Łódź',
        invitedEvents: ['dîner', '🍰-party'],
        attendance: {
          'dîner': createAttendanceRecord('yes', 'guest', null),
          '🍰-party': createAttendanceRecord('yes', 'guest', null)
        },
        mealSelections: {
          'dîner': 'Sushi 🍣'
        },
        pendingMealSelections: undefined
      }
    ];

    const refreshed = refreshPartyPendingMealSelections(members, (eventId) => eventId !== 'dîner');
    expect(refreshed[0].pendingMealSelections).toEqual(['🍰-party']);
  });
});

describe('normalizeGuestProfileAttendance edge cases', () => {
  it('handles missing RSVP block without throwing', () => {
    const profile: GuestProfile = {
      email: 'guest@example.com',
      party: [
        {
          personId: 'primary',
          role: 'primary',
          firstName: 'Taylor',
          lastName: 'Guest',
          invitedEvents: ['reception', 'brunch'],
          attendance: {
            reception: 'yes' as any,
            brunch: createAttendanceRecord('no', 'guest', null)
          },
          mealSelections: undefined,
          dietaryNotes: undefined,
          pendingMealSelections: ['reception']
        }
      ]
    } as GuestProfile;

    expect(() => normalizeGuestProfileAttendance(profile)).not.toThrow();
    expect(profile.party[0].pendingMealSelections).toEqual(['reception']);
  });
});
