// ABOUTME: Minimal in-memory D1 replacement for the sessions table.
// ABOUTME: Handles the query shapes used by cookie helpers and session tests.

import type { Session } from '../../src/types';

type SessionRow = Session & { session_id_hash: string };

export type SessionDb = {
  DB: ReturnType<typeof buildDb>;
  snapshot(): SessionRow[];
};

function buildDb(dispatcher: (query: string, method: 'first' | 'run' | 'all', params: unknown[]) => unknown) {
  return {
    prepare(query: string) {
      const params: unknown[] = [];
      const statement = {
        bind(...next: unknown[]) {
          params.push(...next);
          return statement;
        },
        async first() {
          return dispatcher(query, 'first', params);
        },
        async run() {
          return dispatcher(query, 'run', params);
        },
        async all() {
          return dispatcher(query, 'all', params);
        }
      };
      return statement;
    }
  };
}

export function createSessionDb(initial: SessionRow[] = []): SessionDb {
  let nextId = initial.length > 0 ? Math.max(...initial.map(row => row.id ?? 0)) + 1 : 1;
  const sessions = [...initial];

  const dispatcher = (query: string, method: 'first' | 'run' | 'all', params: unknown[]): unknown => {
    const normalized = query.replace(/\s+/g, ' ').trim().toUpperCase();

    if (method === 'first' && normalized.includes('FROM SESSIONS') && normalized.includes('SESSION_ID_HASH')) {
      const [hash, expiresAfter] = params as [string, number];
      return sessions.find(
        session =>
          session.session_id_hash === hash &&
          (session.expires_at ?? 0) > (expiresAfter ?? 0)
      ) ?? null;
    }

    if (method === 'run' && normalized.startsWith('UPDATE SESSIONS SET LAST_SEEN_AT')) {
      const [lastSeenAt, id] = params as [number, number];
      const session = sessions.find(row => row.id === id);
      if (session) {
        session.last_seen_at = Number(lastSeenAt);
      }
      return { success: true };
    }

    if (method === 'run' && normalized.startsWith('DELETE FROM SESSIONS WHERE ID')) {
      const [id] = params as [number];
      const index = sessions.findIndex(row => row.id === id);
      if (index >= 0) {
        sessions.splice(index, 1);
      }
      return { success: true };
    }

    if (method === 'run' && normalized.startsWith('INSERT INTO SESSIONS')) {
      const [guestId, sessionHash, createdAt, expiresAt, lastSeenAt] = params as [
        number,
        string,
        number,
        number,
        number
      ];
      const newSession: SessionRow = {
        id: nextId++,
        guest_id: Number(guestId),
        session_id_hash: String(sessionHash),
        created_at: Number(createdAt),
        expires_at: Number(expiresAt),
        last_seen_at: Number(lastSeenAt)
      };
      sessions.push(newSession);
      return { success: true, lastRowId: newSession.id };
    }

    if (method === 'all' && normalized.includes('FROM SESSIONS')) {
      return { results: sessions.slice() };
    }

    throw new Error(`SessionDb: Unsupported query ${method} "${query}"`);
  };

  return {
    DB: buildDb(dispatcher),
    snapshot: () => sessions.slice()
  };
}
