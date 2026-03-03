// ABOUTME: Covers admin group-email recipient resolution and send safeguards.
// ABOUTME: Verifies migration usage, preflight mismatch guard, dedupe, and decrypt-failure isolation.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onRequestPost } from '../../../functions/admin/group-email';
import { createMockD1 } from '../../helpers/mock-d1';

vi.mock('../../../src/lib/logger', () => ({
  logError: vi.fn()
}));

vi.mock('../../../src/lib/crypto', () => ({
  decryptJson: vi.fn()
}));

vi.mock('../../../src/lib/gmail', () => ({
  sendGroupEmail: vi.fn()
}));

vi.mock('../../../functions/admin/loadEventSummaries', () => ({
  loadEventSummaries: vi.fn(async () => ({
    events: [
      { id: 'reception', label: 'Reception', requiresMealSelection: false }
    ]
  }))
}));

vi.mock('../../../functions/admin/profileUtils', () => ({
  migrateProfile: vi.fn((profile: any) => profile)
}));

const { decryptJson } = await import('../../../src/lib/crypto');
const { sendGroupEmail } = await import('../../../src/lib/gmail');
const { loadEventSummaries } = await import('../../../functions/admin/loadEventSummaries');
const { migrateProfile } = await import('../../../functions/admin/profileUtils');
const { logError } = await import('../../../src/lib/logger');

const toEnv = (DB: unknown) =>
  ({
    DB,
    KEK_B64: 'secret',
    DEV_MODE: 'true'
  }) as any;

describe('admin group-email handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((handler: TimerHandler) => {
      if (typeof handler === 'function') {
        handler();
      }
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses migrateProfile in filter mode before applying event/status filters', async () => {
    const { DB } = createMockD1((query, method) => {
      if (method === 'all' && query.includes('SELECT email_hash, enc_profile FROM guests ORDER BY email_hash')) {
        return {
          results: [
            { email_hash: 'hash-1', enc_profile: 'enc-1' }
          ]
        };
      }
      if (method === 'run' && query.includes('INSERT INTO audit_events')) {
        return { success: true };
      }
      return { results: [] };
    });

    vi.mocked(decryptJson).mockResolvedValueOnce({
      email: 'guest@example.com',
      party: [
        { invitedEvents: [], attendance: {} }
      ]
    });

    vi.mocked(migrateProfile).mockImplementationOnce((_raw: any, _events: any[]) => ({
      email: 'guest@example.com',
      party: [
        { invitedEvents: ['reception'], attendance: { reception: { status: 'pending' } } }
      ]
    }));

    const response = await onRequestPost({
      request: new Request('https://example.com/admin/group-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: 'Hello',
          body: 'World',
          recipientMode: 'filter',
          recipientEventFilter: 'reception',
          recipientStatusFilter: 'all',
          expectedTotal: 1
        })
      }),
      env: toEnv(DB)
    } as any);

    expect(response.status).toBe(200);
    expect(loadEventSummaries).toHaveBeenCalledTimes(1);
    expect(migrateProfile).toHaveBeenCalledTimes(1);
    expect(sendGroupEmail).toHaveBeenCalledWith(expect.anything(), 'guest@example.com', 'Hello', 'World');
  });

  it('uses migrateProfile in custom mode and queries rows in deterministic order', async () => {
    const { DB, calls } = createMockD1((query, method) => {
      if (method === 'all' && query.includes('WHERE id IN (?) ORDER BY email_hash')) {
        return {
          results: [
            { email_hash: 'hash-2', enc_profile: 'enc-2' }
          ]
        };
      }
      if (method === 'run' && query.includes('INSERT INTO audit_events')) {
        return { success: true };
      }
      return { results: [] };
    });

    vi.mocked(decryptJson).mockResolvedValueOnce({
      email: 'custom@example.com',
      party: []
    });

    const response = await onRequestPost({
      request: new Request('https://example.com/admin/group-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: 'Hello',
          body: 'World',
          recipientMode: 'custom',
          recipientCustomIds: [1],
          expectedTotal: 1
        })
      }),
      env: toEnv(DB)
    } as any);

    expect(response.status).toBe(200);
    expect(migrateProfile).toHaveBeenCalledTimes(1);
    expect(sendGroupEmail).toHaveBeenCalledWith(expect.anything(), 'custom@example.com', 'Hello', 'World');
    expect(calls.some(call => call.query.includes('ORDER BY email_hash'))).toBe(true);
  });

  it('skips decrypt failures and continues sending remaining recipients', async () => {
    const { DB } = createMockD1((query, method) => {
      if (method === 'all' && query.includes('SELECT email_hash, enc_profile FROM guests ORDER BY email_hash')) {
        return {
          results: [
            { email_hash: 'bad-hash', enc_profile: 'enc-bad' },
            { email_hash: 'good-hash', enc_profile: 'enc-good' }
          ]
        };
      }
      if (method === 'run' && query.includes('INSERT INTO audit_events')) {
        return { success: true };
      }
      return { results: [] };
    });

    vi.mocked(decryptJson)
      .mockRejectedValueOnce(new Error('corrupt profile'))
      .mockResolvedValueOnce({
        email: 'good@example.com',
        party: [
          { invitedEvents: ['reception'], attendance: { reception: { status: 'pending' } } }
        ]
      });

    const response = await onRequestPost({
      request: new Request('https://example.com/admin/group-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: 'Hello',
          body: 'World',
          recipientMode: 'filter',
          recipientEventFilter: 'reception',
          recipientStatusFilter: 'all',
          expectedTotal: 1
        })
      }),
      env: toEnv(DB)
    } as any);

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toMatchObject({
      emailsSent: 1,
      failed: 0,
      total: 1
    });
    expect(sendGroupEmail).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith('admin/group-email/decrypt-failed', expect.any(Error));
  });

  it('aborts send when expected total does not match server-resolved recipients', async () => {
    const { DB } = createMockD1((query, method) => {
      if (method === 'all' && query.includes('SELECT email_hash, enc_profile FROM guests ORDER BY email_hash')) {
        return {
          results: [
            { email_hash: 'hash-1', enc_profile: 'enc-1' }
          ]
        };
      }
      return { results: [] };
    });

    vi.mocked(decryptJson).mockResolvedValueOnce({
      email: 'guest@example.com',
      party: [
        { invitedEvents: ['reception'], attendance: { reception: { status: 'pending' } } }
      ]
    });

    const response = await onRequestPost({
      request: new Request('https://example.com/admin/group-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: 'Hello',
          body: 'World',
          recipientMode: 'filter',
          recipientEventFilter: 'reception',
          recipientStatusFilter: 'all',
          expectedTotal: 2
        })
      }),
      env: toEnv(DB)
    } as any);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'Recipient count mismatch. Send aborted.',
      expectedTotal: 2,
      actualTotal: 1
    });
    expect(sendGroupEmail).not.toHaveBeenCalled();
  });

  it('deduplicates and sorts recipient emails before sending batches', async () => {
    const { DB } = createMockD1((query, method) => {
      if (method === 'all' && query.includes('SELECT email_hash, enc_profile FROM guests ORDER BY email_hash')) {
        return {
          results: [
            { email_hash: 'hash-b', enc_profile: 'enc-b' },
            { email_hash: 'hash-a', enc_profile: 'enc-a' },
            { email_hash: 'hash-a2', enc_profile: 'enc-a2' }
          ]
        };
      }
      if (method === 'run' && query.includes('INSERT INTO audit_events')) {
        return { success: true };
      }
      return { results: [] };
    });

    vi.mocked(decryptJson)
      .mockResolvedValueOnce({ email: 'b@example.com', party: [] })
      .mockResolvedValueOnce({ email: 'a@example.com', party: [] })
      .mockResolvedValueOnce({ email: 'A@example.com', party: [] });

    const response = await onRequestPost({
      request: new Request('https://example.com/admin/group-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: 'Hello',
          body: 'World',
          recipientMode: 'filter',
          recipientEventFilter: 'all',
          recipientStatusFilter: 'all',
          expectedTotal: 2
        })
      }),
      env: toEnv(DB)
    } as any);

    expect(response.status).toBe(200);
    expect(sendGroupEmail).toHaveBeenCalledTimes(2);
    expect(vi.mocked(sendGroupEmail).mock.calls[0]?.[1]).toBe('a@example.com');
    expect(vi.mocked(sendGroupEmail).mock.calls[1]?.[1]).toBe('b@example.com');
  });
});
