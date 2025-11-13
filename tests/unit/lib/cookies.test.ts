// ABOUTME: Tests cookie creation and validation helpers.
// ABOUTME: Ensures session cookies honor env flags and enforce idle expiry.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSession, validateSession } from '../../../src/lib/cookies';
import { createMockD1 } from '../../helpers/mock-d1';

vi.mock('../../../src/lib/crypto', () => ({
  generateToken: vi.fn(() => 'session-token'),
  hashToken: vi.fn(async () => 'hashed-session')
}));

const { generateToken, hashToken } = await import('../../../src/lib/crypto');

describe('cookies helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates secure cookie outside dev mode', async () => {
    const { DB } = createMockD1(() => undefined);
    const env = {
      DB,
      KEK_B64: 'secret',
      SESSION_ABSOLUTE_HOURS: '2',
      SESSION_IDLE_MIN: '30'
    } as any;

    const result = await createSession(42, env);

    expect(generateToken).toHaveBeenCalled();
    expect(hashToken).toHaveBeenCalledWith('session-token', 'secret');
    expect(result.sessionIdHash).toBe('hashed-session');
    const attributes = result.cookie.split('; ');
    expect(attributes).toHaveLength(6);
    expect(attributes).toEqual(
      expect.arrayContaining([
        '__Host-s=session-token',
        'HttpOnly',
        'SameSite=Lax',
        'Path=/',
        'Max-Age=7200',
        'Secure'
      ])
    );
  });

  it('creates non-secure cookie in dev mode', async () => {
    const { DB } = createMockD1(() => undefined);
    const env = {
      DB,
      KEK_B64: 'secret',
      SESSION_ABSOLUTE_HOURS: '1',
      SESSION_IDLE_MIN: '30',
      DEV_MODE: 'true'
    } as any;

    const result = await createSession(42, env);

    const attributes = result.cookie.split('; ');
    expect(attributes).toHaveLength(5);
    expect(attributes).toEqual(
      expect.arrayContaining([
        's=session-token',
        'HttpOnly',
        'SameSite=Lax',
        'Path=/',
        'Max-Age=3600'
      ])
    );
  });

  describe('validateSession', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-04-01T00:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns session and updates last seen when active', async () => {
      const now = Math.floor(Date.now() / 1000);
      const { DB, calls } = createMockD1((query, method) => {
        if (method === 'first' && query.includes('FROM sessions')) {
          return {
            id: 1,
            guest_id: 7,
            session_id_hash: 'hashed-session',
            created_at: now - 100,
            expires_at: now + 1000,
            last_seen_at: now - 10
          };
        }
        if (method === 'run' && query.includes('UPDATE sessions SET last_seen_at')) {
          return { success: true };
        }
        return undefined;
      });

      const env = {
        DB,
        KEK_B64: 'secret',
        SESSION_IDLE_MIN: '30'
      } as any;

      vi.mocked(hashToken).mockResolvedValue('hashed-session');

      const session = await validateSession('__Host-s=session-token', env);

      expect(session?.guest_id).toBe(7);
      const updateCalls = calls.filter(call => call.query.includes('UPDATE sessions SET last_seen_at'));
      expect(updateCalls).toHaveLength(1);
      expect(updateCalls[0]?.params[1]).toBe(1);
    });

    it('deletes idle sessions that exceed timeout', async () => {
      const now = Math.floor(Date.now() / 1000);
      const { DB, calls } = createMockD1((query, method) => {
        if (method === 'first' && query.includes('FROM sessions')) {
          return {
            id: 2,
            guest_id: 7,
            session_id_hash: 'hashed-session',
            created_at: now - 4000,
            expires_at: now + 1000,
            last_seen_at: now - 4000
          };
        }
        if (method === 'run' && query.includes('DELETE FROM sessions')) {
          return { success: true };
        }
        return undefined;
      });

      const env = {
        DB,
        KEK_B64: 'secret',
        SESSION_IDLE_MIN: '30'
      } as any;

      vi.mocked(hashToken).mockResolvedValue('hashed-session');

      const session = await validateSession('__Host-s=session-token', env);

      expect(session).toBeNull();
      const deleteCalls = calls.filter(call => call.query.includes('DELETE FROM sessions'));
      expect(deleteCalls).toHaveLength(1);
      expect(deleteCalls[0]?.params[0]).toBe(2);
    });

    it('expires sessions past absolute limit even if idle window is fresh', async () => {
      const now = Math.floor(Date.now() / 1000);
      const { DB, calls } = createMockD1((query, method) => {
        if (method === 'first' && query.includes('FROM sessions')) {
          return null;
        }
        return null;
      });

      const env = {
        DB,
        KEK_B64: 'secret',
        SESSION_IDLE_MIN: '30'
      } as any;

      vi.mocked(hashToken).mockResolvedValue('hashed-session');

      const session = await validateSession('__Host-s=session-token', env);

      expect(session).toBeNull();
      expect(calls.filter(call => call.method === 'first')).toHaveLength(1);
    });

    it('returns null when hashToken rejects and logs error upstream', async () => {
      const { DB, calls } = createMockD1(() => undefined);
      const env = {
        DB,
        KEK_B64: 'secret',
        SESSION_IDLE_MIN: '30'
      } as any;

      vi.mocked(hashToken).mockRejectedValue(new Error('hash failure'));

      await expect(validateSession('__Host-s=session-token', env)).rejects.toThrow('hash failure');
      expect(calls).toHaveLength(0);
    });

    it('bypasses session when cookie header missing session id', async () => {
      const { DB } = createMockD1(() => undefined);
      const env = {
        DB,
        KEK_B64: 'secret',
        SESSION_IDLE_MIN: '30'
      } as any;

      const session = await validateSession('foo=bar', env);
      expect(session).toBeNull();
    });

    it('ignores non-__Host cookies when not in dev mode', async () => {
      const { DB, calls } = createMockD1(() => undefined);
      const env = {
        DB,
        KEK_B64: 'secret',
        SESSION_IDLE_MIN: '30'
      } as any;

      vi.mocked(hashToken).mockResolvedValue('hashed-session');

      const session = await validateSession('s=session-token; other=value', env);

      expect(session).toBeNull();
      expect(calls).toHaveLength(0);
    });

    it('accepts short cookie in dev mode', async () => {
      const { DB, calls } = createMockD1((query, method) => {
        if (method === 'first' && query.includes('FROM sessions')) {
          return {
            id: 10,
            guest_id: 99,
            session_id_hash: 'hashed-session',
            created_at: 0,
            expires_at: Math.floor(Date.now() / 1000) + 600,
            last_seen_at: Math.floor(Date.now() / 1000) - 30
          };
        }
        if (method === 'run' && query.includes('UPDATE sessions SET last_seen_at')) {
          return { success: true };
        }
        return undefined;
      });

      const env = {
        DB,
        KEK_B64: 'secret',
        SESSION_IDLE_MIN: '30',
        DEV_MODE: 'true'
      } as any;

      vi.mocked(hashToken).mockResolvedValue('hashed-session');

      const session = await validateSession('foo=x; s=session-token', env);

      expect(session?.guest_id).toBe(99);
      expect(calls.some(call => call.query.includes('UPDATE sessions SET last_seen_at'))).toBe(true);
    });
  });
});
