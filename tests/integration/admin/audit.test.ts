// ABOUTME: Verifies admin audit endpoint query behavior.
// ABOUTME: Ensures limits clamp correctly and results serialize as expected.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestGet } from '../../../functions/admin/audit';
import { createMockD1 } from '../../helpers/mock-d1';

vi.mock('../../../src/lib/logger', () => ({
  logError: vi.fn()
}));

const baseEnv = (DB: any) => ({
  DB,
  KEK_B64: 'secret',
  DEV_MODE: 'true'
}) as any;

const { logError } = await import('../../../src/lib/logger');

describe('admin audit handler', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });
  it('returns latest audit events with default limit', async () => {
    const sample = [
      { id: 1, guest_id: 10, type: 'invite_clicked', created_at: 1000 },
      { id: 2, guest_id: 11, type: 'verify_ok', created_at: 900 }
    ];

    const { DB } = createMockD1((query, method, params) => {
      if (method === 'all' && query.includes('FROM audit_events ae')) {
        expect(params).toEqual([100]);
        return { results: sample };
      }
      return { results: [] };
    });

    const response = await onRequestGet({
      request: new Request('https://example.com/admin/audit'),
      env: baseEnv(DB)
    } as any);

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toEqual(sample);
  });

  it('clamps limit when provided and filters by guest id', async () => {
    const { DB, calls } = createMockD1((query, method, params) => {
      if (method === 'all' && query.includes('WHERE guest_id = ?')) {
        const [guestParam, limitParam] = params;
        expect(guestParam).toBe('42');
        expect(limitParam).toBe(500);
        return { results: [] };
      }
      return { results: [] };
    });

    const response = await onRequestGet({
      request: new Request('https://example.com/admin/audit?guest_id=42&limit=9999'),
      env: baseEnv(DB)
    } as any);

    expect(response.status).toBe(200);
    await response.text();
    const limitCalls = calls.filter(call => call.query.includes('WHERE guest_id = ?'));
    expect(limitCalls).toHaveLength(1);
  });

  it('returns 500 and logs when database access fails', async () => {
    const error = new Error('d1 failure');
    const { DB } = createMockD1(() => {
      throw error;
    });

    const response = await onRequestGet({
      request: new Request('https://example.com/admin/audit'),
      env: baseEnv(DB)
    } as any);

    expect(response.status).toBe(500);
    await response.text();
    expect(logError).toHaveBeenCalledWith('admin/audit', error);
  });
});
