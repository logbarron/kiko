// ABOUTME: Tests Turnstile verification helper behavior.
// ABOUTME: Ensures failures fall back to false without throwing.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/lib/logger', () => ({
  logError: vi.fn()
}));

const { verifyTurnstile } = await import('../../../src/lib/turnstile');
const { logError } = await import('../../../src/lib/logger');

const originalFetch = globalThis.fetch;

describe('verifyTurnstile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
  });

  it('returns true when Turnstile reports success', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    })) as any;

    const result = await verifyTurnstile('token', 'secret', '1.1.1.1');
    expect(result).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalled();
    expect(logError).not.toHaveBeenCalled();
  });

  it('returns false when fetch throws', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network');
    }) as any;

    const result = await verifyTurnstile('token', 'secret', '1.1.1.1');
    expect(result).toBe(false);
    expect(logError).toHaveBeenCalledWith('turnstile/verify', expect.any(Error));
  });

  it('returns false when API responds with failure', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ success: false }), {
      headers: { 'Content-Type': 'application/json' }
    })) as any;

    const result = await verifyTurnstile('token', 'secret', '1.1.1.1');
    expect(result).toBe(false);
    expect(logError).not.toHaveBeenCalled();
  });

  it('sends expected POST payload to Turnstile API', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    }));
    globalThis.fetch = fetchMock as any;

    const token = 'turnstile-token';
    const secret = 'secret-key';
    const ip = '203.0.113.5';

    await verifyTurnstile(token, secret, ip);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: expect.any(URLSearchParams)
      })
    );

    const params = (fetchMock.mock.calls[0][1] as RequestInit).body as URLSearchParams;
    expect(params.get('secret')).toBe(secret);
    expect(params.get('response')).toBe(token);
    expect(params.get('remoteip')).toBe(ip);
  });

  it('returns false and logs when response JSON cannot be parsed', async () => {
    globalThis.fetch = vi.fn(async () => new Response('not-json', {
      headers: { 'Content-Type': 'application/json' }
    })) as any;

    const result = await verifyTurnstile('token', 'secret', '1.1.1.1');
    expect(result).toBe(false);
    expect(logError).toHaveBeenCalledWith('turnstile/verify', expect.any(Error));
  });
});
