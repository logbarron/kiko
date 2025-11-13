// ABOUTME: Exercises production handlers with malicious inputs to verify SQL remains parameterized.
// ABOUTME: Guards against regressions where user input leaks directly into D1 queries.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockD1 } from '../helpers/mock-d1';

vi.mock('../../src/lib/crypto', () => ({
  hashEmail: vi.fn(async (value: string) => `email-hash:${value}`),
  hashToken: vi.fn(async (value: string) => `token-hash:${value}`),
  generateToken: vi.fn(() => 'generated-token'),
  encryptJson: vi.fn(async () => 'encrypted'),
  decryptJson: vi.fn(async () => ({ magicLinkEmailSubject: 'Subject line' }))
}));

vi.mock('../../src/lib/ratelimit', () => ({
  checkRateLimit: vi.fn(async () => true)
}));

vi.mock('../../src/lib/turnstile', () => ({
  verifyTurnstile: vi.fn(async () => true)
}));

vi.mock('../../src/lib/gmail', () => ({
  sendMagicLinkEmail: vi.fn(async () => undefined)
}));

vi.mock('../../src/lib/logger', () => ({
  logError: vi.fn()
}));

vi.mock('../../src/lib/cookies', () => ({
  createSession: vi.fn(async () => ({
    cookie: 'session-cookie',
    sessionIdHash: 'session-hash'
  }))
}));

const { hashEmail, hashToken } = await import('../../src/lib/crypto');
const { verifyTurnstile } = await import('../../src/lib/turnstile');
const { checkRateLimit } = await import('../../src/lib/ratelimit');
const { sendMagicLinkEmail } = await import('../../src/lib/gmail');
const { logError } = await import('../../src/lib/logger');
const { createSession } = await import('../../src/lib/cookies');

const { onRequestPost: invitePost } = await import('../../functions/invite');
const { onRequestGet: verifyGet } = await import('../../functions/auth/verify');
const { onRequestGet: auditGet } = await import('../../functions/admin/audit');

const FIXED_NOW = new Date('2024-03-01T12:00:00Z');

function buildInviteEnv(DB: unknown) {
  return {
    DB,
    KEK_B64: 'test-secret',
    APP_BASE_URL: 'https://app.test',
    TURNSTILE_SITE_KEY: 'site',
    TURNSTILE_SECRET_KEY: 'turnstile-secret',
    INVITES_PER_EMAIL_PER_HOUR: '3',
    INVITES_PER_IP_PER_10MIN: '5',
    MAGIC_LINK_TTL_MIN: '10',
    SESSION_IDLE_MIN: '30',
    SESSION_ABSOLUTE_HOURS: '24'
  } as const;
}

function buildInviteRequest(email: string) {
  const formBody = new URLSearchParams({
    email,
    'cf-turnstile-response': 'turnstile-token'
  }).toString();

  return new Request('https://example.com/invite', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'CF-Connecting-IP': '203.0.113.77',
      'User-Agent': 'vitest-agent'
    },
    body: formBody
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SQL injection hardening with production handlers', () => {
  it('parameterizes invite email lookups and inserts', async () => {
    const rawEmail = "guest@example.com'OR'1'='1";
    const normalizedEmail = rawEmail.toLowerCase();
    const nowSeconds = Math.floor(Date.now() / 1000);

    const { DB, calls } = createMockD1((query, method, params) => {
      if (query.includes('FROM guests WHERE email_hash = ?')) {
        expect(query).toContain('WHERE email_hash = ?');
        expect(query).not.toContain(rawEmail);
        expect(query).not.toContain(normalizedEmail);
        expect(params).toEqual([`email-hash:${normalizedEmail}`]);
        return { id: 42, invite_clicked_at: null };
      }

      if (query.includes('UPDATE guests SET registered_at')) {
        expect(params).toEqual([nowSeconds, 42]);
        return { success: true };
      }

      if (query.includes('INSERT INTO magic_links')) {
        expect(query).not.toContain(rawEmail);
        expect(query).not.toContain(normalizedEmail);
        expect(query.match(/\?/g) ?? []).toHaveLength(6);
        expect(params).toEqual([
          42,
          'token-hash:generated-token',
          nowSeconds,
          nowSeconds + 600,
          'email-hash:203.0.113.77',
          'vitest-agent'
        ]);
        return { success: true };
      }

      if (query.includes('INSERT INTO audit_events')) {
        expect(params).toEqual([42, 'email_sent', nowSeconds]);
        return { success: true };
      }

      if (query.includes('SELECT enc_details FROM event')) {
        return { enc_details: null };
      }

      return { success: true };
    });

    vi.mocked(verifyTurnstile).mockResolvedValue(true);
    vi.mocked(checkRateLimit).mockResolvedValue(true);

    const response = await invitePost({
      request: buildInviteRequest(rawEmail),
      env: buildInviteEnv(DB),
      data: { nonce: 'abc123' }
    } as any);

    const html = await response.text();
    if (response.status !== 200) {
      throw new Error(
        `invite handler returned ${response.status}: ${html} :: ${JSON.stringify(
          vi.mocked(logError).mock.calls
        )}`
      );
    }
    expect(response.status).toBe(200);
    expect(vi.mocked(hashEmail).mock.calls).toEqual([
      [normalizedEmail, 'test-secret'],
      ['203.0.113.77', 'test-secret']
    ]);
    expect(vi.mocked(hashToken)).toHaveBeenCalledWith('generated-token', 'test-secret');
    expect(vi.mocked(sendMagicLinkEmail)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logError)).not.toHaveBeenCalled();

    const guestSelect = calls.find(call => call.query.includes('FROM guests WHERE email_hash'));
    expect(guestSelect).toBeDefined();

    const magicInsert = calls.find(call => call.query.includes('INSERT INTO magic_links'));
    expect(magicInsert).toBeDefined();

    calls.forEach(({ query }) => {
      expect(query).not.toContain(rawEmail);
      expect(query).not.toContain(normalizedEmail);
      expect(query.toUpperCase()).not.toContain("'OR'");
      expect(query).not.toContain("'1'='1");
    });
  });

  it('binds magic link tokens and session creation in verify handler', async () => {
    const maliciousToken = "abc'; DROP TABLE magic_links; --";
    const nowSeconds = Math.floor(Date.now() / 1000);

    const { DB, calls } = createMockD1((query, method, params) => {
      if (query.includes('FROM magic_links')) {
        expect(query).toContain('WHERE token_hash = ?');
        expect(query).not.toContain(maliciousToken);
        expect(params).toEqual([`token-hash:${maliciousToken}`]);
        return {
          id: 7,
          guest_id: 87,
          expires_at: nowSeconds + 600,
          used_at: null
        };
      }

      if (query.includes('UPDATE magic_links SET used_at')) {
        expect(params).toEqual([nowSeconds, 7]);
        return { success: true };
      }

      if (query.includes('INSERT INTO sessions')) {
        expect(params).toEqual([87, 'session-hash', nowSeconds, nowSeconds + 86400, nowSeconds]);
        return { success: true };
      }

      if (query.includes('INSERT INTO audit_events')) {
        expect(params[0]).toBe(87);
        expect(typeof params[1]).toBe('string');
        expect(params[2]).toBe(nowSeconds);
        return { success: true };
      }

      return { results: [] };
    });

    const response = await verifyGet({
      request: new Request(
        `https://example.com/auth/verify?token=${encodeURIComponent(maliciousToken)}`
      ),
      env: {
        DB,
        KEK_B64: 'test-secret',
        SESSION_ABSOLUTE_HOURS: '24',
        SESSION_IDLE_MIN: '30'
      },
      data: { nonce: 'nonce' }
    } as any);

    expect(response.status).toBe(302);
    expect(vi.mocked(hashToken)).toHaveBeenCalledWith(maliciousToken, 'test-secret');
    expect(vi.mocked(createSession)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logError)).not.toHaveBeenCalled();

    const selectCall = calls.find(call => call.query.includes('FROM magic_links'));
    expect(selectCall).toBeDefined();

    calls.forEach(({ query }) => {
      expect(query).not.toContain(maliciousToken);
      expect(query.toUpperCase()).not.toContain('DROP TABLE');
      expect(query.toUpperCase()).not.toContain('UNION SELECT');
    });
  });

  it('keeps admin audit filters parameterized when guest_id is hostile', async () => {
    const maliciousGuestId = "7; DROP TABLE audit_events; --";

    const { DB, calls } = createMockD1((query, method, params) => {
      expect(query.match(/\?/g)?.length ?? 0).toBe(params.length);
      if (query.includes('FROM audit_events')) {
        expect(query).toContain('WHERE guest_id = ?');
        expect(query).not.toContain(maliciousGuestId);
        expect(params).toEqual([maliciousGuestId, 25]);
        return { results: [] };
      }
      return { results: [] };
    });

    const response = await auditGet({
      request: new Request(
        `https://example.com/admin/audit?guest_id=${encodeURIComponent(maliciousGuestId)}&limit=25`
      ),
      env: { DB, DEV_MODE: 'true' }
    } as any);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);

    const auditCall = calls.find(call => call.query.includes('FROM audit_events'));
    expect(auditCall).toBeDefined();

    calls.forEach(({ query }) => {
      expect(query).not.toContain(maliciousGuestId);
      expect(query.toUpperCase()).not.toContain('DROP TABLE');
    });
  });
});
