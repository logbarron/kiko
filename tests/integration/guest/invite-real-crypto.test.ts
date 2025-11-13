// ABOUTME: Ensures invite handler works with real crypto helpers.
// ABOUTME: Verifies ciphertext and hashes produced during magic link flow.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockD1 } from '../../helpers/mock-d1';

const TEST_KEK_B64 = Buffer.from('0123456789abcdef0123456789abcdef').toString('base64');

describe('invite handler with real crypto', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('creates magic link and decrypts event details using real crypto', async () => {
    vi.doMock('../../../src/lib/turnstile', () => ({
      verifyTurnstile: vi.fn(async () => true)
    }));

    vi.doMock('../../../src/lib/ratelimit', () => ({
      checkRateLimit: vi.fn(async () => true)
    }));

    const sendMagicLinkEmail = vi.fn(async () => undefined);
    vi.doMock('../../../src/lib/gmail', () => ({
      sendMagicLinkEmail
    }));

    const cryptoActual = await vi.importActual<typeof import('../../../src/lib/crypto')>(
      '../../../src/lib/crypto'
    );

    vi.doMock('../../../src/lib/crypto', () => ({
      ...cryptoActual,
      generateToken: vi.fn(() => 'tok-integration'),
      hashEmail: vi.fn((email: string, key: string) => cryptoActual.hashEmail(email, key)),
      hashToken: vi.fn((token: string, key: string) => cryptoActual.hashToken(token, key))
    }));

    const { hashEmail, hashToken, encryptJson } = await import('../../../src/lib/crypto');
    const { onRequestPost } = await import('../../../functions/invite');

    const guestEmailHash = await cryptoActual.hashEmail('guest@example.com', TEST_KEK_B64);
    const ipHash = await cryptoActual.hashEmail('203.0.113.5', TEST_KEK_B64);
    const expectedTokenHash = await cryptoActual.hashToken('tok-integration', TEST_KEK_B64);

    const eventDetails = {
      magicLinkEmailSubject: 'Welcome!',
      siteTitle: 'Kiko & Sam'
    } as const;

    const encryptedDetails = await encryptJson(
      eventDetails,
      TEST_KEK_B64,
      'event',
      '1',
      'details'
    );

    const { DB, calls } = createMockD1((query, method, params) => {
      if (method === 'first' && query.includes('FROM guests WHERE email_hash')) {
        expect(params?.[0]).toBe(guestEmailHash);
        return { id: 42, invite_clicked_at: null };
      }
      if (method === 'first' && query.includes('FROM event WHERE id = 1')) {
        return { enc_details: encryptedDetails };
      }
      if (method === 'run' && query.includes('UPDATE guests SET registered_at')) {
        expect(params).toEqual([expect.any(Number), 42]);
        return { success: true };
      }
      if (method === 'run' && query.includes('INSERT INTO magic_links')) {
        expect(params?.[0]).toBe(42);
        expect(params?.[1]).toBe(expectedTokenHash);
        expect(params?.[4]).toBe(ipHash);
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
      APP_BASE_URL: 'https://app.example.com',
      TURNSTILE_SITE_KEY: 'site',
      TURNSTILE_SECRET_KEY: 'turnstile-secret',
      INVITES_PER_EMAIL_PER_HOUR: '3',
      INVITES_PER_IP_PER_10MIN: '5',
      MAGIC_LINK_TTL_MIN: '10',
      SESSION_IDLE_MIN: '30',
      SESSION_ABSOLUTE_HOURS: '24'
    } as any;

    const formBody = new URLSearchParams({
      email: 'guest@example.com',
      'cf-turnstile-response': 'token'
    }).toString();

    const response = await onRequestPost({
      request: new Request('https://example.com/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'CF-Connecting-IP': '203.0.113.5',
          'User-Agent': 'TestAgent/1.0'
        },
        body: formBody
      }),
      env,
      data: { nonce: 'nonce' }
    } as any);

    expect(response.status).toBe(200);
    await response.text();

    expect(sendMagicLinkEmail).toHaveBeenCalledTimes(1);
    const [[mailerEnv, recipient, magicLink, subject]] = sendMagicLinkEmail.mock.calls;
    expect(recipient).toBe('guest@example.com');
    expect(magicLink).toBe('https://app.example.com/auth/verify?token=tok-integration');
    expect(subject).toBe('Welcome!');
    expect(mailerEnv.APP_BASE_URL).toBe('https://app.example.com');

    expect(hashEmail).toHaveBeenCalledTimes(2);
    expect(hashEmail).toHaveBeenNthCalledWith(1, 'guest@example.com', TEST_KEK_B64);
    expect(hashEmail).toHaveBeenNthCalledWith(2, '203.0.113.5', TEST_KEK_B64);
    expect(hashToken).toHaveBeenCalledWith('tok-integration', TEST_KEK_B64);
    expect(
      calls.some(call => call.query.includes('INSERT INTO magic_links') && call.params[1] === expectedTokenHash)
    ).toBe(true);
  });
});
