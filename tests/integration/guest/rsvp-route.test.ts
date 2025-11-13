// ABOUTME: Exercises RSVP submission flow through the Pages function.
// ABOUTME: Checks rejection paths and successful persistence of guest responses.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onRequestPost } from '../../../functions/rsvp';
import { createMockD1 } from '../../helpers/mock-d1';

vi.mock('../../../src/lib/cookies', () => ({
  validateSession: vi.fn()
}));

vi.mock('../../../src/lib/crypto', () => ({
  decryptJson: vi.fn(),
  encryptJson: vi.fn(async () => 'encrypted')
}));

vi.mock('../../../src/lib/logger', () => ({
  logError: vi.fn()
}));

const { validateSession } = await import('../../../src/lib/cookies');
const { decryptJson, encryptJson } = await import('../../../src/lib/crypto');
const { logError } = await import('../../../src/lib/logger');

function buildEnv(DB: any) {
  return {
    DB,
    KEK_B64: 'secret',
    SESSION_IDLE_MIN: '30',
    SESSION_ABSOLUTE_HOURS: '24',
    DEV_MODE: 'true'
  } as any;
}

describe('rsvp handler POST', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-03-01T00:00:00Z'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns unauthorized when session cookie missing', async () => {
    const { DB } = createMockD1(() => undefined);
    const response = await onRequestPost({
      request: new Request('https://example.com/rsvp', { method: 'POST' }),
      env: buildEnv(DB),
      data: {}
    } as any);

    expect(response.status).toBe(401);
  });

  it('returns 423 when RSVP window is closed', async () => {
    const { DB } = createMockD1((query, method) => {
      if (method === 'first' && query.includes('FROM guests WHERE id')) {
        return { enc_profile: 'enc-profile', email_hash: 'hash' };
      }
      if (method === 'first' && query.includes('FROM event WHERE id = 1')) {
        return { enc_details: 'enc-event' };
      }
      return undefined;
    });

    vi.mocked(validateSession).mockResolvedValue({
      id: 1,
      guest_id: 7,
      session_id_hash: 'hash',
      created_at: 0,
      expires_at: 999999,
      last_seen_at: 0
    });

    vi.mocked(decryptJson)
      .mockResolvedValueOnce({ email: 'guest@example.com', party: [] })
      .mockResolvedValueOnce({ rsvpStatus: { mode: 'closed', message: 'RSVP closed' } });

    const response = await onRequestPost({
      request: new Request('https://example.com/rsvp', {
        method: 'POST',
        headers: {
          Cookie: '__Host-s=token',
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({ partyResponses: '{}' })
      }),
      env: buildEnv(DB),
      data: {}
    } as any);

    expect(response.status).toBe(423);
    await expect(response.json()).resolves.toEqual({ success: false, error: 'RSVP closed', code: 'RSVP_CLOSED' });
  });

  it('persists responses and returns pending meal events', async () => {
    const now = Math.floor(Date.now() / 1000);
    const { DB, calls } = createMockD1((query, method) => {
      if (method === 'first' && query.includes('FROM guests WHERE id')) {
        return { enc_profile: 'enc-profile', email_hash: 'hash' };
      }
      if (method === 'first' && query.includes('FROM event WHERE id = 1')) {
        return { enc_details: 'enc-event' };
      }
      if (method === 'run' && query.includes('UPDATE guests SET enc_profile')) {
        return { success: true };
      }
      if (method === 'run' && query.includes('INSERT INTO rsvps')) {
        return { success: true };
      }
      if (method === 'run' && query.includes('INSERT INTO audit_events')) {
        return { success: true };
      }
      return undefined;
    });

    vi.mocked(validateSession).mockResolvedValue({
      id: 1,
      guest_id: 7,
      session_id_hash: 'hash',
      created_at: now - 10,
      expires_at: now + 3600,
      last_seen_at: now - 10
    });

    const guestProfile = {
      email: 'guest@example.com',
      party: [
        {
          personId: 'primary',
          role: 'primary',
          invitedEvents: ['dinner'],
          attendance: {},
          mealSelections: undefined
        }
      ]
    };

    const eventDetails = {
      events: [
        {
          id: 'dinner',
          label: 'Dinner',
          requiresMealSelection: true,
          mealOptions: ['Fish']
        }
      ]
    } as any;

    vi.mocked(decryptJson)
      .mockResolvedValueOnce(guestProfile)
      .mockResolvedValueOnce(eventDetails);

    const payload = JSON.stringify({
      primary: {
        events: {
          dinner: { status: 'yes' }
        },
        meals: {
          dinner: 'Fish'
        }
      }
    });

    const response = await onRequestPost({
      request: new Request('https://example.com/rsvp', {
        method: 'POST',
        headers: {
          Cookie: '__Host-s=token',
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({ partyResponses: payload })
      }),
      env: buildEnv(DB),
      data: {}
    } as any);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, pendingMealEvents: [] });

    const auditCalls = calls.filter(call => call.query.includes('INSERT INTO audit_events'));
    expect(auditCalls).toHaveLength(2);
    const auditTypes = auditCalls.map(call => call.params[1]).sort();
    expect(auditTypes).toEqual(['event_attendance_updated', 'rsvp_submit']);
    auditCalls.forEach(call => {
      expect(call.params[0]).toBe(7);
      const timestamp = Number(call.params[2]);
      expect(Number.isFinite(timestamp)).toBe(true);
      expect(timestamp).toBeGreaterThanOrEqual(now);
      expect(timestamp).toBeLessThanOrEqual(now + 1);
    });

    const guestUpdateCalls = calls.filter(call => call.query.includes('UPDATE guests SET enc_profile'));
    expect(guestUpdateCalls).toHaveLength(1);
    const [encProfile, updatedAt, guestId] = guestUpdateCalls[0]?.params ?? [];
    expect(encProfile).toBe('encrypted');
    expect(guestId).toBe(7);
    expect(Number(updatedAt)).toBeGreaterThanOrEqual(now);
    expect(Number(updatedAt)).toBeLessThanOrEqual(now + 1);

    const rsvpInsertCalls = calls.filter(call => call.query.includes('INSERT INTO rsvps'));
    expect(rsvpInsertCalls).toHaveLength(1);
    const [guestIdParam, encRsvp, rsvpTimestamp] = rsvpInsertCalls[0]?.params ?? [];
    expect(guestIdParam).toBe(7);
    expect(encRsvp).toBe('encrypted');
    expect(Number(rsvpTimestamp)).toBeGreaterThanOrEqual(now);
    expect(Number(rsvpTimestamp)).toBeLessThanOrEqual(now + 1);

    const encryptCalls = vi.mocked(encryptJson).mock.calls;
    expect(encryptCalls).toHaveLength(2);
    const [profilePayload, rsvpPayload] = encryptCalls.map(call => call[0] as any);
    expect(profilePayload.party[0]?.attendance.dinner.status).toBe('yes');
    expect(rsvpPayload.partyResponses.primary.events.dinner.status).toBe('yes');
  });

  it('reports pending meal events when selections are missing', async () => {
    const now = Math.floor(Date.now() / 1000);
    const { DB, calls } = createMockD1((query, method) => {
      if (method === 'first' && query.includes('FROM guests WHERE id')) {
        return { enc_profile: 'enc-profile', email_hash: 'hash' };
      }
      if (method === 'first' && query.includes('FROM event WHERE id = 1')) {
        return { enc_details: 'enc-event' };
      }
      if (method === 'run') {
        return { success: true };
      }
      return undefined;
    });

    vi.mocked(validateSession).mockResolvedValue({
      id: 2,
      guest_id: 9,
      session_id_hash: 'hash',
      created_at: now - 10,
      expires_at: now + 3600,
      last_seen_at: now - 10
    });

    vi.mocked(decryptJson)
      .mockResolvedValueOnce({
        email: 'guest@example.com',
        party: [{
          personId: 'primary',
          role: 'primary',
          invitedEvents: ['dinner'],
          attendance: {}
        }]
      })
      .mockResolvedValueOnce({
        events: [{
          id: 'dinner',
          requiresMealSelection: true,
          mealOptions: ['Fish', 'Chicken']
        }]
      });

    const response = await onRequestPost({
      request: new Request('https://example.com/rsvp', {
        method: 'POST',
        headers: {
          Cookie: '__Host-s=token',
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          partyResponses: JSON.stringify({
            primary: {
              events: { dinner: { status: 'yes' } }
            }
          })
        })
      }),
      env: buildEnv(DB),
      data: {}
    } as any);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, pendingMealEvents: ['dinner'] });

    const auditCalls = calls.filter(call => call.query.includes('INSERT INTO audit_events'));
    expect(auditCalls.map(call => call.params[1])).toContain('rsvp_submit');
    expect(vi.mocked(encryptJson)).toHaveBeenCalledTimes(2);
  });

  describe('error handling', () => {
    it('returns 500 when payload JSON is invalid', async () => {
      const { DB } = createMockD1((query, method) => {
        if (method === 'first' && query.includes('FROM guests WHERE id')) {
          return { enc_profile: 'enc-profile', email_hash: 'hash' };
        }
        if (method === 'first' && query.includes('FROM event WHERE id = 1')) {
          return { enc_details: 'enc-event' };
        }
        return undefined;
      });

      vi.mocked(validateSession).mockResolvedValue({
        id: 1,
        guest_id: 7,
        session_id_hash: 'hash',
        created_at: 0,
        expires_at: 999999,
        last_seen_at: 0
      });

      vi.mocked(decryptJson)
        .mockResolvedValueOnce({
          email: 'guest@example.com',
          party: []
        })
        .mockResolvedValueOnce({ events: [] });

      const response = await onRequestPost({
        request: new Request('https://example.com/rsvp', {
          method: 'POST',
          headers: {
            Cookie: '__Host-s=token',
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({ partyResponses: 'not-json' })
        }),
        env: buildEnv(DB),
        data: {}
      } as any);

      expect(response.status).toBe(500);
      await expect(response.text()).resolves.toBe('An error occurred');
      expect(logError).toHaveBeenCalledWith('rsvp', expect.any(Error));
      expect(encryptJson).not.toHaveBeenCalled();
    });

    it('returns 500 when submission references unknown party member', async () => {
      const { DB } = createMockD1((query, method) => {
        if (method === 'first' && query.includes('FROM guests WHERE id')) {
          return { enc_profile: 'enc-profile', email_hash: 'hash' };
        }
        if (method === 'first' && query.includes('FROM event WHERE id = 1')) {
          return { enc_details: 'enc-event' };
        }
        return undefined;
      });

      vi.mocked(validateSession).mockResolvedValue({
        id: 1,
        guest_id: 7,
        session_id_hash: 'hash',
        created_at: 0,
        expires_at: 999999,
        last_seen_at: 0
      });

      vi.mocked(decryptJson)
        .mockResolvedValueOnce({
          email: 'guest@example.com',
          party: [
            {
              personId: 'primary',
              role: 'primary',
              invitedEvents: [],
              attendance: {}
            }
          ]
        })
        .mockResolvedValueOnce({ events: [] });

      const payload = JSON.stringify({ stranger: { events: {} } });

      const response = await onRequestPost({
        request: new Request('https://example.com/rsvp', {
          method: 'POST',
          headers: {
            Cookie: '__Host-s=token',
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({ partyResponses: payload })
        }),
        env: buildEnv(DB),
        data: {}
      } as any);

      expect(response.status).toBe(500);
      await expect(response.text()).resolves.toBe('An error occurred');
      expect(logError).toHaveBeenCalledWith('rsvp', expect.any(Error));
      expect(encryptJson).not.toHaveBeenCalled();
    });

    it('returns 500 when meal selection is not permitted', async () => {
      const { DB } = createMockD1((query, method) => {
        if (method === 'first' && query.includes('FROM guests WHERE id')) {
          return { enc_profile: 'enc-profile', email_hash: 'hash' };
        }
        if (method === 'first' && query.includes('FROM event WHERE id = 1')) {
          return { enc_details: 'enc-event' };
        }
        return undefined;
      });

      vi.mocked(validateSession).mockResolvedValue({
        id: 1,
        guest_id: 7,
        session_id_hash: 'hash',
        created_at: 0,
        expires_at: 999999,
        last_seen_at: 0
      });

      vi.mocked(decryptJson)
        .mockResolvedValueOnce({
          email: 'guest@example.com',
          party: [
            {
              personId: 'primary',
              role: 'primary',
              invitedEvents: ['dinner'],
              attendance: {}
            }
          ]
        })
        .mockResolvedValueOnce({
          events: [
            {
              id: 'dinner',
              requiresMealSelection: true,
              mealOptions: ['Chicken']
            }
          ]
        });

      const payload = JSON.stringify({
        primary: {
          events: {
            dinner: { status: 'yes' }
          },
          meals: {
            dinner: 'Steak'
          }
        }
      });

      const response = await onRequestPost({
        request: new Request('https://example.com/rsvp', {
          method: 'POST',
          headers: {
            Cookie: '__Host-s=token',
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({ partyResponses: payload })
        }),
        env: buildEnv(DB),
        data: {}
      } as any);

      expect(response.status).toBe(500);
      await expect(response.text()).resolves.toBe('An error occurred');
      expect(logError).toHaveBeenCalledWith('rsvp', expect.any(Error));
      expect(encryptJson).not.toHaveBeenCalled();
    });
  });
});
