// ABOUTME: Exercises session create/validate/expire flow using real helpers.
// ABOUTME: Ensures cookies.ts interacts with the sessions table correctly.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSession, validateSession } from '../../src/lib/cookies';
import { createSessionDb } from '../helpers/session-db';
import { hashEmail } from '../../src/lib/crypto';

const TEST_KEK_B64 = Buffer.from('0123456789abcdef0123456789abcdef').toString('base64');

describe('session lifecycle integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-02-01T00:00:00Z'));
  });

  it('creates, validates, refreshes, and expires sessions', async () => {
    const { DB, snapshot } = createSessionDb();

    const env = {
      DB,
      KEK_B64: TEST_KEK_B64,
      SESSION_IDLE_MIN: '1',
      SESSION_ABSOLUTE_HOURS: '2',
      DEV_MODE: 'true'
    } as any;

    // Create a session
    const { cookie, sessionIdHash } = await createSession(7, env);
    expect(cookie).toContain('s=');

    // Insert persisted session row (mimic handler behavior)
    const now = Math.floor(Date.now() / 1000);
    await DB.prepare(
      `INSERT INTO sessions (guest_id, session_id_hash, created_at, expires_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(7, sessionIdHash, now, now + 7200, now).run();

    // Validate active session
    const session = await validateSession(cookie, env);
    expect(session).not.toBeNull();
    expect(session?.guest_id).toBe(7);

    // Advance within idle timeout - should refresh last_seen_at
    vi.advanceTimersByTime(30 * 1000);
    await validateSession(cookie, env);
    const refreshed = snapshot()[0];
    expect(refreshed.last_seen_at).toBeGreaterThanOrEqual(now + 30);

    // Advance beyond idle timeout - should delete session
    vi.advanceTimersByTime(90 * 1000); // 120 seconds total > idle window
    const expired = await validateSession(cookie, env);
    expect(expired).toBeNull();
    expect(snapshot()).toHaveLength(0);
  });
});

