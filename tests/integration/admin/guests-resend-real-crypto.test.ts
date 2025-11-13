// ABOUTME: Verifies admin guest resend flow with real crypto helpers.
// ABOUTME: Confirms ciphertext updates and invite email subject handling.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockD1 } from '../../helpers/mock-d1';

const TEST_KEK_B64 = Buffer.from('abcdef1234567890abcdef1234567890').toString('base64');

describe('admin guests resend (real crypto)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-08-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('re-encrypts profile and sends invite email', async () => {
    const sendWeddingInvitation = vi.fn(async () => undefined);

    vi.doMock('../../../src/lib/logger', () => ({
      logError: vi.fn()
    }));

    vi.doMock('../../../src/lib/access', () => ({
      requireAccessAssertion: vi.fn(async () => ({ sub: 'admin', email: 'admin@example.com' }))
    }));

    vi.doMock('../../../functions/admin/loadEventSummaries', () => ({
      loadEventSummaries: vi.fn(async () => ({
        events: [
          { id: 'welcome', requiresMealSelection: false }
        ]
      }))
    }));

    vi.doMock('../../../src/lib/gmail', () => ({
      sendWeddingInvitation
    }));

    const cryptoActual = await vi.importActual<typeof import('../../../src/lib/crypto')>(
      '../../../src/lib/crypto'
    );
    vi.doMock('../../../src/lib/crypto', () => cryptoActual);

    const { encryptJson, hashEmail, hashToken } = await import('../../../src/lib/crypto');
    const { onRequestPost } = await import('../../../functions/admin/guests');

    const email = 'guest+unicode@example.com';
    const inviteToken = 'existing-token';
    const emailHash = await hashEmail(email, TEST_KEK_B64);
    const inviteTokenHash = await hashToken(inviteToken, TEST_KEK_B64);

    const guestProfile = {
      email,
      party: [
        {
          personId: 'primary',
          role: 'primary',
          firstName: 'Anaïs',
          lastName: 'Łódź',
          invitedEvents: ['welcome'],
          attendance: {}
        }
      ],
      inviteToken,
      inviteSentAt: 0
    };

    const encProfileOriginal = await encryptJson(
      guestProfile,
      TEST_KEK_B64,
      'guests',
      emailHash,
      'profile'
    );

    const eventDetails = {
      inviteEmailSubject: 'You Are Invited!'
    };

    const encEventDetails = await encryptJson(
      eventDetails,
      TEST_KEK_B64,
      'event',
      '1',
      'details'
    );

    const { DB, calls } = createMockD1((query, method, params) => {
      if (method === 'first' && query.includes('FROM guests WHERE id = ?')) {
        return {
          enc_profile: encProfileOriginal,
          email_hash: emailHash,
          invite_token_hash: inviteTokenHash
        };
      }
      if (method === 'first' && query.includes('FROM event WHERE id = 1')) {
        return { enc_details: encEventDetails };
      }
      if (method === 'run' && query.includes('INSERT INTO magic_links')) {
        expect(params?.[0]).toBe(1);
        expect(params?.[1]).toBe(inviteTokenHash);
        return { success: true };
      }
      if (method === 'run' && query.includes('INSERT INTO audit_events')) {
        return { success: true };
      }
      if (method === 'run' && query.includes('UPDATE guests SET enc_profile')) {
        return { success: true };
      }
      return { results: [] };
    });

    const env = {
      DB,
      KEK_B64: TEST_KEK_B64,
      APP_BASE_URL: 'https://app.example.com',
      DEV_MODE: 'true'
    } as any;

    const response = await onRequestPost({
      request: new Request('https://example.com/admin/guests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resend', guestId: 1 })
      }),
      env
    } as any);

    expect(response.status).toBe(200);
    await response.json();

    expect(sendWeddingInvitation).toHaveBeenCalledTimes(1);
    const [mailerEnv, recipient, partyArg, trackingUrl, subject] = sendWeddingInvitation.mock.calls[0];
    expect(recipient).toBe(email);
    expect(Array.isArray(partyArg)).toBe(true);
    expect(trackingUrl).toBe(`https://app.example.com/invite?t=${inviteToken}`);
    expect(subject).toBe('You Are Invited!');
    expect(mailerEnv.APP_BASE_URL).toBe('https://app.example.com');

    const updateCall = calls.find(call => call.query.includes('UPDATE guests SET enc_profile'));
    expect(updateCall).toBeDefined();
    const [encProfileNext, inviteHashNext, inviteSentAt, updatedAt, guestIdParam] = updateCall!.params as [string, string, number, number, number];
    expect(typeof encProfileNext).toBe('string');
    expect(encProfileNext).not.toBe(encProfileOriginal);
    expect(inviteHashNext).toBe(inviteTokenHash);
    expect(inviteSentAt).toBeGreaterThan(0);
    expect(updatedAt).toBe(inviteSentAt);
    expect(guestIdParam).toBe(1);
  });
});
