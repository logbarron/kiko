// ABOUTME: Tests concurrent magic link verification for race conditions.
// ABOUTME: Ensures single-use tokens cannot be used multiple times in parallel.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockD1 } from '../helpers/mock-d1';
import { onRequestGet } from '../../functions/auth/verify';

// Mock dependencies
vi.mock('../../src/lib/crypto', () => ({
  hashToken: vi.fn(async (token: string) => `hashed-${token}`)
}));

vi.mock('../../src/lib/cookies', () => ({
  createSession: vi.fn(async () => ({
    cookie: 'session-cookie',
    sessionIdHash: 'session-hash'
  }))
}));

vi.mock('../../src/lib/logger', () => ({
  logError: vi.fn()
}));

const { hashToken } = await import('../../src/lib/crypto');
const { createSession } = await import('../../src/lib/cookies');

describe('Concurrent magic link verification safety', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-10-08T00:00:00Z'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('only allows one concurrent request to verify same magic link', async () => {
    const now = Math.floor(Date.now() / 1000);
    let linkUsageCheckCount = 0;
    let linkMarkUsedCount = 0;
    let sessionCreateCount = 0;
    let linkUsed = false;

    const { DB, calls } = createMockD1((query, method) => {
      if (method === 'first' && query.includes('FROM magic_links')) {
        linkUsageCheckCount++;
        if (!linkUsed) {
          linkUsed = true;
          return {
            id: 1,
            guest_id: 7,
            expires_at: now + 600,
            used_at: null
          };
        }
        return {
          id: 1,
          guest_id: 7,
          expires_at: now + 600,
          used_at: now - 60
        };
      }
      if (method === 'run' && query.includes('UPDATE magic_links SET used_at')) {
        linkMarkUsedCount++;
        return { success: true };
      }
      if (method === 'run' && query.includes('INSERT INTO sessions')) {
        sessionCreateCount++;
        return { success: true };
      }
      if (method === 'run' && query.includes('INSERT INTO audit_events')) {
        return { success: true };
      }
      return undefined;
    });

    const env = {
      DB,
      KEK_B64: 'secret',
      SESSION_ABSOLUTE_HOURS: '24',
      SESSION_IDLE_MIN: '30',
      DEV_MODE: 'true'
    } as any;

    // Create 5 parallel verification requests with same token
    const requests = Array.from({ length: 5 }, () =>
      onRequestGet({
        request: new Request('https://example.com/auth/verify?token=same-token'),
        env,
        data: { nonce: 'nonce' }
      } as any)
    );

    const responses = await Promise.allSettled(requests);

    expect(responses.every(r => r.status === 'fulfilled')).toBe(true);

    const fulfilled = responses.filter(
      (result): result is PromiseFulfilledResult<Response> => result.status === 'fulfilled'
    );
    const successes = fulfilled.filter(r => r.value.status === 302);
    const failures = fulfilled.filter(r => r.value.status === 400);

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(4);

    const redirect = successes[0].value;
    expect(redirect.headers.get('Location')).toBe('/event');
    expect(redirect.headers.get('Set-Cookie')).toBe('session-cookie');

    await Promise.all(
      failures.map(async ({ value }) => {
        expect(await value.text()).toContain('This link has already been used.');
        expect(value.headers.get('Set-Cookie')).toBeNull();
      })
    );

    expect(linkUsageCheckCount).toBe(5);
    expect(linkMarkUsedCount).toBe(1);
    expect(sessionCreateCount).toBe(1);
    expect(vi.mocked(hashToken)).toHaveBeenCalledTimes(5);
    expect(vi.mocked(createSession)).toHaveBeenCalledTimes(1);

    const auditCalls = calls.filter(call => call.query.includes('INSERT INTO audit_events'));
    const auditTypes = auditCalls.map(call => call.params[1]);
    expect(auditTypes.filter(type => type === 'link_clicked')).toHaveLength(5);
    expect(auditTypes.filter(type => type === 'verify_ok')).toHaveLength(1);
    expect(auditTypes.filter(type => type === 'verify_fail')).toHaveLength(4);
    auditCalls.forEach(call => {
      expect(call.params[0]).toBe(7);
    });

    const markUsedCalls = calls.filter(call =>
      call.query.includes('UPDATE magic_links SET used_at')
    );
    expect(markUsedCalls).toHaveLength(1);
    const [markUsed] = markUsedCalls;
    expect(markUsed.query).toContain('WHERE id = ?');
    expect(markUsed.params).toEqual([now, 1]);
  });

  it('rejects magic link that was used by another concurrent request', async () => {
    const now = Math.floor(Date.now() / 1000);
    let requestCount = 0;

    let updateCount = 0;
    const { DB, calls } = createMockD1((query, method, params) => {
      if (method === 'first' && query.includes('FROM magic_links')) {
        requestCount++;
        // First request sees it as unused, subsequent see it as used
        if (requestCount === 1) {
          return {
            id: 1,
            guest_id: 7,
            expires_at: now + 600,
            used_at: null
          };
        } else {
          return {
            id: 1,
            guest_id: 7,
            expires_at: now + 600,
            used_at: now - 1 // Already used
          };
        }
      }
      if (method === 'run' && query.includes('UPDATE magic_links')) {
        updateCount++;
        expect(params).toEqual([now, 1]);
        return { success: true };
      }
      if (method === 'run' && query.includes('INSERT INTO sessions')) {
        return { success: true };
      }
      if (method === 'run' && query.includes('INSERT INTO audit_events')) {
        return { success: true };
      }
      return undefined;
    });

    const env = {
      DB,
      KEK_B64: 'secret',
      SESSION_ABSOLUTE_HOURS: '24',
      SESSION_IDLE_MIN: '30',
      DEV_MODE: 'true'
    } as any;

    // Make requests sequentially to simulate race condition
    const response1 = await onRequestGet({
      request: new Request('https://example.com/auth/verify?token=token1'),
      env,
      data: { nonce: 'nonce' }
    } as any);

    const response2 = await onRequestGet({
      request: new Request('https://example.com/auth/verify?token=token1'),
      env,
      data: { nonce: 'nonce' }
    } as any);

    // First should succeed, second should fail
    expect(response1.status).toBe(302);
    expect(response2.status).toBe(400); // Link already used
    expect(response1.headers.get('Set-Cookie')).toBe('session-cookie');
    expect(response2.headers.get('Set-Cookie')).toBeNull();
    await expect(response2.text()).resolves.toContain('This link has already been used.');
    expect(vi.mocked(createSession)).toHaveBeenCalledTimes(1);
    expect(updateCount).toBe(1);

    const auditCalls = calls.filter(call => call.query.includes('INSERT INTO audit_events'));
    const auditTypes = auditCalls.map(call => call.params[1]);
    expect(auditTypes).toEqual([
      'link_clicked',
      'verify_ok',
      'link_clicked',
      'verify_fail'
    ]);

    const markUsedCalls = calls.filter(call =>
      call.query.includes('UPDATE magic_links SET used_at')
    );
    expect(markUsedCalls).toHaveLength(1);
    expect(markUsedCalls[0].query).toContain('WHERE id = ?');
    expect(markUsedCalls[0].params).toEqual([now, 1]);

    const sessionInsertCalls = calls.filter(call =>
      call.query.includes('INSERT INTO sessions')
    );
    expect(sessionInsertCalls).toHaveLength(1);
    expect(sessionInsertCalls[0].query).toContain('guest_id, session_id_hash');
  });

  it('prevents session creation when magic link verification fails', async () => {
    const now = Math.floor(Date.now() / 1000);

    const { DB, calls } = createMockD1((query, method) => {
      if (method === 'first' && query.includes('FROM magic_links')) {
        // Return expired link
        return {
          id: 1,
          guest_id: 7,
          expires_at: now - 100, // Expired
          used_at: null
        };
      }
      if (method === 'run' && query.includes('INSERT INTO audit_events')) {
        return { success: true };
      }
      return undefined;
    });

    const env = {
      DB,
      KEK_B64: 'secret',
      SESSION_ABSOLUTE_HOURS: '24',
      SESSION_IDLE_MIN: '30'
    } as any;

    const response = await onRequestGet({
      request: new Request('https://example.com/auth/verify?token=expired-token'),
      env,
      data: { nonce: 'nonce' }
    } as any);

    expect(response.status).toBe(429);
    await expect(response.text()).resolves.toContain('Invalid or expired link.');

    // Verify createSession was never called
    expect(createSession).not.toHaveBeenCalled();

    const auditCalls = calls.filter(call => call.query.includes('INSERT INTO audit_events'));
    const auditTypes = auditCalls.map(call => call.params[1]);
    expect(auditTypes).toEqual(['verify_fail']);

    const markUsedCalls = calls.filter(call =>
      call.query.includes('UPDATE magic_links SET used_at')
    );
    expect(markUsedCalls).toHaveLength(0);
  });
});
