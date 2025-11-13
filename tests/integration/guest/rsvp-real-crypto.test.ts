// ABOUTME: Exercises RSVP submission with real crypto helpers.
// ABOUTME: Ensures ciphertext persists without exposing plaintext.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockD1 } from '../../helpers/mock-d1';

const TEST_KEK_B64 = Buffer.from('0123456789abcdef0123456789abcdef').toString('base64');

describe('rsvp handler with real crypto', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('updates guest profile using real encrypt/decrypt', async () => {
    const session = {
      id: 1,
      guest_id: 7,
      session_id_hash: 'hash',
      created_at: Math.floor(Date.now() / 1000) - 60,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      last_seen_at: Math.floor(Date.now() / 1000) - 30
    };

    vi.doMock('../../../src/lib/cookies', () => ({
      validateSession: vi.fn(async () => session)
    }));

    vi.doMock('../../../src/lib/logger', () => ({
      logError: vi.fn()
    }));

    const cryptoActual = await vi.importActual<typeof import('../../../src/lib/crypto')>(
      '../../../src/lib/crypto'
    );

    vi.doMock('../../../src/lib/crypto', () => ({
      ...cryptoActual,
      encryptJson: vi.fn((...args: Parameters<typeof cryptoActual.encryptJson>) =>
        cryptoActual.encryptJson(...args)
      ),
      decryptJson: vi.fn((...args: Parameters<typeof cryptoActual.decryptJson>) =>
        cryptoActual.decryptJson(...args)
      )
    }));

    const { encryptJson, decryptJson } = await import('../../../src/lib/crypto');
    const { validateSession } = await import('../../../src/lib/cookies');
    const { onRequestPost } = await import('../../../functions/rsvp');

    const emailHash = await cryptoActual.hashEmail('guest@example.com', TEST_KEK_B64);

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
          mealOptions: ['Fish', 'Veg']
        }
      ]
    } as const;

    const encryptedProfile = await cryptoActual.encryptJson(
      guestProfile,
      TEST_KEK_B64,
      'guests',
      emailHash,
      'profile'
    );

    const encryptedEvent = await cryptoActual.encryptJson(
      eventDetails,
      TEST_KEK_B64,
      'event',
      '1',
      'details'
    );

    const { DB, calls } = createMockD1((query, method, params) => {
      if (method === 'first' && query.includes('FROM guests WHERE id')) {
        return { enc_profile: encryptedProfile, email_hash: emailHash };
      }
      if (method === 'first' && query.includes('FROM event WHERE id = 1')) {
        return { enc_details: encryptedEvent };
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
      return { success: true };
    });

    const env = {
      DB,
      KEK_B64: TEST_KEK_B64,
      SESSION_IDLE_MIN: '30',
      SESSION_ABSOLUTE_HOURS: '24',
      DEV_MODE: 'true'
    } as any;

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
          Cookie: '__Host-s=session',
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({ partyResponses: payload })
      }),
      env,
      data: {}
    } as any);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, pendingMealEvents: [] });

    expect(validateSession).toHaveBeenCalledWith('__Host-s=session', env);
    expect(decryptJson).toHaveBeenCalledWith(encryptedProfile, TEST_KEK_B64, 'guests', emailHash, 'profile');
    expect(decryptJson).toHaveBeenCalledWith(encryptedEvent, TEST_KEK_B64, 'event', '1', 'details');

    const guestUpdate = calls.find(call => call.query.includes('UPDATE guests SET enc_profile'));
    expect(guestUpdate).toBeDefined();
    const [newEncProfile, updatedAt, guestId] = guestUpdate!.params;
    expect(typeof newEncProfile).toBe('string');
    expect(newEncProfile).not.toBe(encryptedProfile);
    expect(typeof updatedAt).toBe('number');
    expect(guestId).toBe(session.guest_id);

    const rsvpInsert = calls.find(call => call.query.includes('INSERT INTO rsvps'));
    expect(rsvpInsert).toBeDefined();
    const [guestIdParam, encRsvp, rsvpTimestamp] = rsvpInsert!.params;
    expect(guestIdParam).toBe(session.guest_id);
    expect(typeof encRsvp).toBe('string');
    expect(encRsvp).not.toContain('guest@example.com');
    expect(typeof rsvpTimestamp).toBe('number');
  });
});

