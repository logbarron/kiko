// ABOUTME: Exercises the magic link verification handler.
// ABOUTME: Confirms success redirects and failures render protective errors.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onRequestGet } from '../../../functions/auth/verify';
import { createMockD1 } from '../../helpers/mock-d1';
import { createInMemoryKv } from '../../helpers/in-memory-kv';

vi.mock('../../../src/lib/crypto', () => ({
  hashToken: vi.fn(async (_token: string) => 'hashed-token')
}));

vi.mock('../../../src/lib/cookies', () => ({
  createSession: vi.fn(async () => ({ cookie: 'session-cookie', sessionIdHash: 'session-hash' }))
}));

vi.mock('../../../src/lib/logger', () => ({
  logError: vi.fn()
}));

const { hashToken } = await import('../../../src/lib/crypto');
const { createSession } = await import('../../../src/lib/cookies');
const { logError } = await import('../../../src/lib/logger');

describe('auth verify handler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders error when token is missing', async () => {
    const { DB } = createMockD1(() => undefined);
    const env = {
      DB,
      KEK_B64: 'secret',
      SESSION_ABSOLUTE_HOURS: '24',
      SESSION_IDLE_MIN: '30',
      DEV_MODE: 'true'
    } as any;

    const response = await onRequestGet({
      request: new Request('https://example.com/auth/verify'),
      env,
      data: { nonce: 'nonce' }
    } as any);

    expect(response.status).toBe(400);
    const html = await response.text();
    expect(html).toContain('Invalid or expired link.');
    expect(html).toContain('nonce="nonce"');
    expect(hashToken).not.toHaveBeenCalled();
  });

  it('rejects expired links and logs audit events', async () => {
    const { DB, calls } = createMockD1((query, method) => {
      if (method === 'first' && query.includes('FROM magic_links')) {
        return { id: 1, guest_id: 42, expires_at: Math.floor(Date.now() / 1000) - 10, used_at: null };
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

    const response = await onRequestGet({
      request: new Request('https://example.com/auth/verify?token=abc'),
      env,
      data: { nonce: 'nonce' }
    } as any);

    expect(hashToken).toHaveBeenCalledWith('abc', 'secret');
    expect(response.status).toBe(400);
    const html = await response.text();
    expect(html).toContain('This link has expired.');
    expect(html).toContain('nonce="nonce"');
    const auditCalls = calls.filter(call => call.query.includes('INSERT INTO audit_events'));
    expect(auditCalls).toHaveLength(2); // link_clicked + verify_fail
    expect(auditCalls[0]?.params).toEqual([42, 'link_clicked', expect.any(Number)]);
    expect(auditCalls[1]?.params).toEqual([42, 'verify_fail', expect.any(Number)]);
    expect(createSession).not.toHaveBeenCalled();
  });

  it('rejects already used links without creating a session', async () => {
    const now = Math.floor(Date.now() / 1000);
    const { DB, calls } = createMockD1((query, method) => {
      if (method === 'first' && query.includes('FROM magic_links')) {
        return { id: 3, guest_id: 9, expires_at: now + 100, used_at: now - 50 };
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

    const response = await onRequestGet({
      request: new Request('https://example.com/auth/verify?token=used'),
      env,
      data: { nonce: 'nonce' }
    } as any);

    expect(hashToken).toHaveBeenCalledWith('used', 'secret');
    expect(response.status).toBe(400);
    const html = await response.text();
    expect(html).toContain('This link has already been used.');
    expect(html).toContain('nonce="nonce"');
    expect(createSession).not.toHaveBeenCalled();

    const auditTypes = calls
      .filter(call => call.query.includes('INSERT INTO audit_events'))
      .map(call => call.params[1]);
    expect(auditTypes).toEqual(['link_clicked', 'verify_fail']);
  });

  it('creates a session and redirects for valid links', async () => {
    const now = Math.floor(Date.now() / 1000);
    const { DB, calls } = createMockD1((query, method, params) => {
      if (method === 'first' && query.includes('FROM magic_links')) {
        return { id: 5, guest_id: 7, expires_at: now + 60, used_at: null };
      }
      if (method === 'run' && query.startsWith('UPDATE magic_links')) {
        expect(params).toEqual([now, 5]);
        return { success: true };
      }
      if (method === 'run' && query.includes('INSERT INTO sessions')) {
        expect(params?.[0]).toBe(7);
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
      SESSION_ABSOLUTE_HOURS: '12',
      SESSION_IDLE_MIN: '30',
      DEV_MODE: 'true'
    } as any;

    const response = await onRequestGet({
      request: new Request('https://example.com/auth/verify?token=valid'),
      env,
      data: { nonce: 'nonce' }
    } as any);

    expect(hashToken).toHaveBeenCalledWith('valid', 'secret');
    expect(createSession).toHaveBeenCalledWith(7, env);
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/event');
    expect(response.headers.get('Set-Cookie')).toBe('session-cookie');

    const auditCalls = calls.filter(call => call.query.includes('INSERT INTO audit_events'));
    expect(auditCalls).toHaveLength(2); // link_clicked + verify_ok
    const auditTypes = auditCalls.map(call => call.params[1]).sort();
    expect(auditTypes).toEqual(['link_clicked', 'verify_ok']);
    auditCalls.forEach(call => {
      expect(call.params[0]).toBe(7);
      expect(call.params[2]).toBe(now);
    });
  });

  it('throttles repeated requests from the same IP', async () => {
    const now = Math.floor(Date.now() / 1000);
    const kv = createInMemoryKv(() => now);
    const { DB, calls } = createMockD1((query, method, params) => {
      if (method === 'first' && query.includes('FROM magic_links')) {
        return { id: 9, guest_id: 4, expires_at: now + 60, used_at: null };
      }
      if (method === 'run' && query.includes('UPDATE magic_links')) {
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
      DEV_MODE: 'true',
      VERIFY_PER_IP_PER_10MIN: '1',
      RATE_LIMIT_KV: kv
    } as any;

    const request = (ip: string) =>
      onRequestGet({
        request: new Request('https://example.com/auth/verify?token=abc', {
          headers: { 'CF-Connecting-IP': ip }
        }),
        env,
        data: { nonce: 'nonce' }
      } as any);

    const first = await request('203.0.113.10');
    expect(first.status).toBe(302);

    const second = await request('203.0.113.10');
    expect(second.status).toBe(429);
    const body = await second.text();
    expect(body).toContain('Invalid or expired link.');

    const magicSelects = calls.filter(call => call.query.includes('FROM magic_links'));
    expect(magicSelects).toHaveLength(1);
  });

  it('throttles repeated verification attempts for the same token', async () => {
    const now = Math.floor(Date.now() / 1000);
    const kv = createInMemoryKv(() => now);
    const tokenKey = `verify:token:hashed-token:${Math.floor(now / 600)}`;

    const { DB, calls } = createMockD1((query, method, params) => {
      if (method === 'first' && query.includes('FROM magic_links')) {
        return { id: 11, guest_id: 6, expires_at: now + 120, used_at: null };
      }
      if (method === 'run' && query.includes('UPDATE magic_links')) {
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
      DEV_MODE: 'true',
      RATE_LIMIT_KV: kv
    } as any;

    const doRequest = () =>
      onRequestGet({
        request: new Request('https://example.com/auth/verify?token=abc', {
          headers: { 'CF-Connecting-IP': '198.51.100.2' }
        }),
        env,
        data: { nonce: 'nonce' }
      } as any);

    const first = await doRequest();
    expect(first.status).toBe(302);

    await env.RATE_LIMIT_KV.put(tokenKey, '5');

    const second = await doRequest();
    expect(second.status).toBe(429);
    const html = await second.text();
    expect(html).toContain('Invalid or expired link.');

    const magicSelects = calls.filter(call => call.query.includes('FROM magic_links'));
    expect(magicSelects).toHaveLength(1);
  });

  it('logs an error when session creation fails', async () => {
    const now = Math.floor(Date.now() / 1000);
    const error = new Error('session boom');
    const { DB, calls } = createMockD1((query, method) => {
      if (method === 'first' && query.includes('FROM magic_links')) {
        return { id: 6, guest_id: 8, expires_at: now + 60, used_at: null };
      }
      if (method === 'run' && query.startsWith('UPDATE magic_links')) {
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
      SESSION_ABSOLUTE_HOURS: '12',
      SESSION_IDLE_MIN: '30',
      DEV_MODE: 'true'
    } as any;

    vi.mocked(createSession).mockRejectedValueOnce(error);

    const response = await onRequestGet({
      request: new Request('https://example.com/auth/verify?token=failure'),
      env,
      data: { nonce: 'nonce' }
    } as any);

    expect(hashToken).toHaveBeenCalledWith('failure', 'secret');
    expect(createSession).toHaveBeenCalledWith(8, env);
    expect(response.status).toBe(400);
    const html = await response.text();
    expect(html).toContain('An error occurred. Please request a new link.');
    expect(html).toContain('nonce="nonce"');
    const auditCalls = calls.filter(call => call.query.includes('INSERT INTO audit_events'));
    expect(auditCalls.map(call => call.params[1])).toEqual(['link_clicked']);
    expect(logError).toHaveBeenCalledWith('auth/verify', error);
  });
});
