// ABOUTME: Validates the invite request handler behavior.
// ABOUTME: Ensures anti-enumeration, rate limits, and happy path email sending.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestPost } from '../../../functions/invite';
import { createMockD1 } from '../../helpers/mock-d1';

vi.mock('../../../src/lib/turnstile', () => ({
  verifyTurnstile: vi.fn()
}));

vi.mock('../../../src/lib/ratelimit', () => ({
  checkRateLimit: vi.fn()
}));

vi.mock('../../../src/lib/crypto', () => ({
  decryptJson: vi.fn(),
  encryptJson: vi.fn(),
  generateToken: vi.fn(() => 'token-value'),
  hashEmail: vi.fn(),
  hashToken: vi.fn(() => Promise.resolve('hashed'))
}));

vi.mock('../../../src/lib/gmail', () => ({
  sendMagicLinkEmail: vi.fn()
}));

vi.mock('../../../src/lib/logger', () => ({
  logError: vi.fn()
}));

const { verifyTurnstile } = await import('../../../src/lib/turnstile');
const { checkRateLimit } = await import('../../../src/lib/ratelimit');
const { hashEmail, generateToken, hashToken, decryptJson } = await import('../../../src/lib/crypto');
const { sendMagicLinkEmail } = await import('../../../src/lib/gmail');
const { logError } = await import('../../../src/lib/logger');

describe('invite handler POST', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function buildRequest(body: string, headers: Record<string, string> = {}) {
    return new Request('https://example.com/invite', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...headers
      },
      body
    });
  }

  function baseEnv(DB: any) {
    return {
      DB,
      KEK_B64: 'secret',
      APP_BASE_URL: 'https://app.example.com',
      TURNSTILE_SITE_KEY: 'site',
      TURNSTILE_SECRET_KEY: 'secret',
      INVITES_PER_EMAIL_PER_HOUR: '3',
      INVITES_PER_IP_PER_10MIN: '5',
      MAGIC_LINK_TTL_MIN: '10',
      SESSION_IDLE_MIN: '30',
      SESSION_ABSOLUTE_HOURS: '24'
    } as any;
  }

  it('returns an error when email is missing', async () => {
    const { DB } = createMockD1(() => undefined);

    const response = await onRequestPost({
      request: buildRequest('cf-turnstile-response=token'),
      env: baseEnv(DB),
      data: { nonce: 'nonce' }
    } as any);

    expect(response.status).toBe(400);
    const html = await response.text();
    expect(html).toContain('Please enter a valid email address.');
    expect(html).toContain('nonce="nonce"');
    expect(verifyTurnstile).not.toHaveBeenCalled();
  });

  it('returns generic success for unknown email without sending mail', async () => {
    const { DB } = createMockD1((query, method) => {
      if (method === 'first' && query.includes('FROM guests WHERE email_hash')) {
        return null;
      }
      if (method === 'run' && query.includes('INSERT INTO audit_events')) {
        return { success: true };
      }
      return undefined;
    });

    vi.mocked(verifyTurnstile).mockResolvedValue(true);
    vi.mocked(checkRateLimit).mockResolvedValue(true);
    vi.mocked(hashEmail)
      .mockResolvedValueOnce('email-hash');

    const formBody = new URLSearchParams({
      email: 'guest@example.com',
      'cf-turnstile-response': 'token'
    }).toString();

    const response = await onRequestPost({
      request: buildRequest(formBody, { 'CF-Connecting-IP': '198.51.100.20' }),
      env: baseEnv(DB),
      data: { nonce: 'nonce' }
    } as any);

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain('Perfect! Check your email now');
    expect(sendMagicLinkEmail).not.toHaveBeenCalled();
  });

  it('fails security check when Turnstile verification fails', async () => {
    const { DB, calls } = createMockD1(() => undefined);

    vi.mocked(verifyTurnstile).mockResolvedValue(false);
    vi.mocked(checkRateLimit).mockResolvedValue(true);

    const formBody = new URLSearchParams({
      email: 'guest@example.com',
      'cf-turnstile-response': 'token'
    }).toString();

    const response = await onRequestPost({
      request: buildRequest(formBody, { 'CF-Connecting-IP': '198.51.100.30' }),
      env: baseEnv(DB),
      data: { nonce: 'nonce' }
    } as any);

    expect(response.status).toBe(400);
    expect(verifyTurnstile).toHaveBeenCalledWith('token', 'secret', '198.51.100.30');
    const html = await response.text();
    expect(html).toContain('Security check failed');
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(hashEmail).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it('sends magic link email for known guests and records audit events', async () => {
    const eventDetails = {
      magicLinkEmailSubject: 'Welcome!'
    } as any;

    const { DB, calls } = createMockD1((query, method, params) => {
      if (method === 'first' && query.includes('FROM guests WHERE email_hash')) {
        return { id: 9, invite_clicked_at: null };
      }
      if (method === 'first' && query.includes('FROM event WHERE id = 1')) {
        return { enc_details: 'encrypted-event' };
      }
      if (method === 'run' && query.includes('UPDATE guests SET registered_at')) {
        expect(params?.[1]).toBe(9);
        return { success: true };
      }
      if (method === 'run' && query.includes('INSERT INTO magic_links')) {
        expect(params?.[0]).toBe(9);
        return { success: true };
      }
      if (method === 'run' && query.includes('INSERT INTO audit_events')) {
        return { success: true };
      }
      return undefined;
    });

    vi.mocked(verifyTurnstile).mockResolvedValue(true);
    vi.mocked(checkRateLimit)
      .mockResolvedValueOnce(true) // IP limit
      .mockResolvedValueOnce(true); // Email limit
    vi.mocked(hashEmail)
      .mockResolvedValueOnce('email-hash') // email hash lookup
      .mockResolvedValueOnce('ip-hash'); // client IP hash
    vi.mocked(hashToken).mockResolvedValue('token-hash');
    vi.mocked(decryptJson).mockResolvedValue(eventDetails);
    vi.mocked(generateToken).mockReturnValue('tok123');

    const formBody = new URLSearchParams({
      email: 'guest@example.com',
      'cf-turnstile-response': 'token'
    }).toString();

    const env = baseEnv(DB);

    const response = await onRequestPost({
      request: buildRequest(formBody, { 'CF-Connecting-IP': '203.0.113.5', 'User-Agent': 'TestAgent/1.0' }),
      env,
      data: { nonce: 'nonce' }
    } as any);

    expect(response.status).toBe(200);
    await response.text();

    expect(sendMagicLinkEmail).toHaveBeenCalledWith(
      expect.any(Object),
      'guest@example.com',
      'https://app.example.com/auth/verify?token=tok123',
      'Welcome!'
    );

    expect(hashEmail).toHaveBeenNthCalledWith(1, 'guest@example.com', 'secret');
    expect(hashEmail).toHaveBeenNthCalledWith(2, '203.0.113.5', 'secret');

    const auditInserts = calls.filter(call => call.query.includes('INSERT INTO audit_events'));
    expect(auditInserts).toHaveLength(1);
    expect(auditInserts[0]?.params).toEqual([9, 'email_sent', expect.any(Number)]);

    const [magicInsert] = calls.filter(call => call.query.includes('INSERT INTO magic_links'));
    expect(magicInsert).toBeDefined();
    const [guestIdParam, tokenHashParam, issuedAt, expiresAt, ipHash, ua] = magicInsert.params;
    expect(guestIdParam).toBe(9);
    expect(tokenHashParam).toBe('token-hash');
    expect(typeof issuedAt).toBe('number');
    expect(expiresAt).toBe(issuedAt + Number(env.MAGIC_LINK_TTL_MIN) * 60);
    expect(ipHash).toBe('ip-hash');
    expect(ua).toBe('TestAgent/1.0');
  });

  it('returns generic success when email sending fails and logs error', async () => {
    const { DB, calls } = createMockD1((query, method, params) => {
      if (method === 'first' && query.includes('FROM guests WHERE email_hash')) {
        return { id: 11, invite_clicked_at: null };
      }
      if (method === 'first' && query.includes('FROM event WHERE id = 1')) {
        return { enc_details: 'enc-event' };
      }
      if (method === 'run' && query.includes('UPDATE guests SET registered_at')) {
        expect(params?.[1]).toBe(11);
        return { success: true };
      }
      if (method === 'run' && query.includes('INSERT INTO magic_links')) {
        expect(params?.[0]).toBe(11);
        return { success: true };
      }
      if (method === 'run' && query.includes('INSERT INTO audit_events')) {
        return { success: true };
      }
      return undefined;
    });

    vi.mocked(verifyTurnstile).mockResolvedValue(true);
    vi.mocked(checkRateLimit)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true);
    vi.mocked(hashEmail)
      .mockResolvedValueOnce('email-hash')
      .mockResolvedValueOnce('ip-hash');
    vi.mocked(hashToken).mockResolvedValue('token-hash');
    vi.mocked(decryptJson).mockResolvedValue({
      magicLinkEmailSubject: 'Subject'
    });
    vi.mocked(generateToken).mockReturnValue('tok456');
    vi.mocked(sendMagicLinkEmail).mockRejectedValue(new Error('Gmail down'));

    const formBody = new URLSearchParams({
      email: 'guest@example.com',
      'cf-turnstile-response': 'token'
    }).toString();

    const env = baseEnv(DB);

    const response = await onRequestPost({
      request: buildRequest(formBody, { 'CF-Connecting-IP': '203.0.113.20' }),
      env,
      data: { nonce: 'nonce' }
    } as any);

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('Perfect! Check your email now');
    expect(sendMagicLinkEmail).toHaveBeenCalledWith(
      expect.any(Object),
      'guest@example.com',
      'https://app.example.com/auth/verify?token=tok456',
      'Subject'
    );
    expect(logError).toHaveBeenCalledWith('invite/post/email', expect.any(Error));

    expect(hashEmail).toHaveBeenNthCalledWith(1, 'guest@example.com', 'secret');
    expect(hashEmail).toHaveBeenNthCalledWith(2, '203.0.113.20', 'secret');

    const auditInserts = calls.filter(call => call.query.includes('INSERT INTO audit_events'));
    expect(auditInserts).toHaveLength(1);
    expect(auditInserts[0]?.params).toEqual([11, 'email_sent', expect.any(Number)]);
    const [magicInsert] = calls.filter(call => call.query.includes('INSERT INTO magic_links'));
    expect(magicInsert).toBeDefined();
    const [guestIdParam, tokenHashParam, issuedAt, expiresAt, ipHash, ua] = magicInsert.params;
    expect(guestIdParam).toBe(11);
    expect(tokenHashParam).toBe('token-hash');
    expect(typeof issuedAt).toBe('number');
    expect(expiresAt).toBe(issuedAt + Number(env.MAGIC_LINK_TTL_MIN) * 60);
    expect(ipHash).toBe('ip-hash');
    expect(ua).toBe('');
  });

  it('enforces IP rate limit with 429 response', async () => {
    const { DB } = createMockD1(() => ({ results: [] }));

    vi.mocked(verifyTurnstile).mockResolvedValue(true);
    vi.mocked(checkRateLimit).mockResolvedValueOnce(false);

    const formBody = new URLSearchParams({
      email: 'guest@example.com',
      'cf-turnstile-response': 'token'
    }).toString();

    const response = await onRequestPost({
      request: buildRequest(formBody, { 'CF-Connecting-IP': '203.0.113.9' }),
      env: baseEnv(DB),
      data: { nonce: 'nonce' }
    } as any);

    expect(response.status).toBe(429);
    const html = await response.text();
    expect(html).toContain('Too many requests');
    expect(sendMagicLinkEmail).not.toHaveBeenCalled();
    expect(hashEmail).not.toHaveBeenCalled();
  });

  it('returns generic success when email rate limit exceeded', async () => {
    const { DB } = createMockD1((query, method) => {
      if (method === 'first' && query.includes('FROM guests WHERE email_hash')) {
        return { id: 5, invite_clicked_at: null };
      }
      return { results: [] };
    });

    vi.mocked(verifyTurnstile).mockResolvedValue(true);
    vi.mocked(checkRateLimit)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    vi.mocked(hashEmail)
      .mockResolvedValueOnce('email-hash');

    const formBody = new URLSearchParams({
      email: 'guest@example.com',
      'cf-turnstile-response': 'token'
    }).toString();

    const response = await onRequestPost({
      request: buildRequest(formBody, { 'CF-Connecting-IP': '203.0.113.10' }),
      env: baseEnv(DB),
      data: { nonce: 'nonce' }
    } as any);

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('Perfect! Check your email now');
    expect(sendMagicLinkEmail).not.toHaveBeenCalled();
  });
});

describe('invite handler GET', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function baseEnv(DB: any) {
    return {
      DB,
      KEK_B64: 'secret',
      TURNSTILE_SITE_KEY: 'site',
      TURNSTILE_SECRET_KEY: 'secret',
      MAGIC_LINK_TTL_MIN: '10',
      INVITES_PER_EMAIL_PER_10MIN: '5',
      INVITES_PER_EMAIL_PER_HOUR: '3'
    } as any;
  }

  it('records invite click for valid tracking token', async () => {
    const { DB, calls } = createMockD1((query, method, params) => {
      if (method === 'first' && query.includes('FROM guests WHERE invite_token_hash')) {
        return { id: 12, invite_clicked_at: null };
      }
      if (method === 'run' && query.includes('UPDATE guests SET invite_clicked_at')) {
        expect(params?.[1]).toBe(12);
        return { success: true };
      }
      if (method === 'run' && query.includes('INSERT INTO audit_events')) {
        return { success: true };
      }
      return undefined;
    });

    vi.mocked(hashToken).mockResolvedValue('tracking-hash');

    const { onRequestGet } = await import('../../../functions/invite');

    const response = await onRequestGet({
      request: new Request('https://example.com/invite?t=abc'),
      env: baseEnv(DB),
      data: { nonce: 'nonce' }
    } as any);

    expect(response.status).toBe(200);
    expect(hashToken).toHaveBeenCalledWith('abc', 'secret');
    const updates = calls.filter(call => call.query.includes('UPDATE guests SET invite_clicked_at'));
    expect(updates).toHaveLength(1);
    const audits = calls.filter(call => call.query.includes('INSERT INTO audit_events'));
    expect(audits).toHaveLength(1);
  });

  it('skips updates when invite already clicked', async () => {
    const { DB, calls } = createMockD1((query, method) => {
      if (method === 'first' && query.includes('FROM guests WHERE invite_token_hash')) {
        return { id: 12, invite_clicked_at: 999 };
      }
      return undefined;
    });

    vi.mocked(hashToken).mockResolvedValue('tracking-hash');

    const { onRequestGet } = await import('../../../functions/invite');

    const response = await onRequestGet({
      request: new Request('https://example.com/invite?t=abc'),
      env: baseEnv(DB),
      data: { nonce: 'nonce' }
    } as any);

    expect(response.status).toBe(200);
    const updates = calls.filter(call => call.query.includes('UPDATE guests SET invite_clicked_at'));
    expect(updates).toHaveLength(0);
  });
});
