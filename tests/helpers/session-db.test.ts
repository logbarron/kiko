// ABOUTME: Validates the in-memory session DB helper matches D1 semantics used in tests.

import { describe, expect, it } from 'vitest';
import { createSessionDb } from './session-db';

describe('createSessionDb', () => {
  it('supports insert and select by hash', async () => {
    const { DB, snapshot } = createSessionDb();

    await DB.prepare(
      'INSERT INTO sessions (guest_id, session_id_hash, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(7, 'hash', 100, 200, 100).run();

    const row = await DB.prepare(
      'SELECT * FROM sessions WHERE session_id_hash = ? AND expires_at > ?'
    ).bind('hash', 150).first();

    expect(row).toMatchObject({
      guest_id: 7,
      session_id_hash: 'hash',
      expires_at: 200
    });
    expect(snapshot()).toHaveLength(1);
  });

  it('updates last_seen_at and prunes expired sessions', async () => {
    const { DB } = createSessionDb();

    await DB.prepare(
      'INSERT INTO sessions (guest_id, session_id_hash, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(7, 'hash', 100, 200, 100).run();

    await DB.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?')
      .bind(150, 1)
      .run();

    const result = await DB.prepare(
      'SELECT * FROM sessions WHERE session_id_hash = ? AND expires_at > ?'
    ).bind('hash', 150).first();

    expect(result?.last_seen_at).toBe(150);

    await DB.prepare('DELETE FROM sessions WHERE id = ?').bind(1).run();
    const afterDelete = await DB.prepare(
      'SELECT * FROM sessions WHERE session_id_hash = ? AND expires_at > ?'
    ).bind('hash', 150).first();
    expect(afterDelete).toBeNull();
  });
});

