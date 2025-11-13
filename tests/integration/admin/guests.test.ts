// ABOUTME: Covers admin guests GET and POST handlers.

// ABOUTME: Covers admin guests GET and POST handlers.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onRequestGet, onRequestPost } from '../../../functions/admin/guests';
import { createMockD1 } from '../../helpers/mock-d1';

vi.mock('../../../src/lib/logger', () => ({
  logError: vi.fn()
}));

vi.mock('../../../src/lib/crypto', () => ({
  decryptJson: vi.fn(),
  encryptJson: vi.fn(async () => 'encrypted'),
  generateToken: vi.fn(() => 'token'),
  hashToken: vi.fn(async () => 'hash')
}));

vi.mock('../../../src/lib/gmail', () => ({
  sendWeddingInvitation: vi.fn()
}));

vi.mock('../../../functions/admin/loadEventSummaries', () => ({
  loadEventSummaries: vi.fn(async () => ({
    events: [
      { id: 'welcome', requiresMealSelection: true },
      { id: 'ceremony', requiresMealSelection: false }
    ]
  }))
}));

vi.mock('../../../functions/admin/profileUtils', () => ({
  buildPartyMembers: vi.fn(),
  migrateProfile: vi.fn((profile) => profile),
  normalizeEventSelection: vi.fn(),
  trimToString: vi.fn()
}));

const { decryptJson, encryptJson } = await import('../../../src/lib/crypto');
const { sendWeddingInvitation } = await import('../../../src/lib/gmail');

function baseEnv(DB: any) {
  return {
    DB,
    KEK_B64: 'secret',
    DEV_MODE: 'true'
  } as any;
}

describe('admin guests handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('lists guests with decrypted profiles', async () => {
    const guestRow = {
      id: 1,
      email_hash: 'hash',
      enc_profile: 'enc-profile',
      created_at: 100,
      invite_sent_at: null,
      invite_clicked_at: null,
      registered_at: null,
      enc_rsvp: null
    };

    const { DB, calls } = createMockD1((query, method) => {
      if (method === 'all' && query.includes('FROM guests g')) {
        return { results: [guestRow] };
      }
      if (method === 'all' && query.includes('FROM audit_events')) {
        return { results: [] };
      }
      if (method === 'all' && query.includes('FROM magic_links')) {
        return { results: [] };
      }
      return undefined;
    });

    vi.mocked(decryptJson).mockResolvedValue({
      email: 'guest@example.com',
      party: [
        {
          personId: 'primary',
          role: 'primary',
          invitedEvents: ['welcome'],
          attendance: {}
        }
      ]
    });

    const response = await onRequestGet({
      request: new Request('https://example.com/admin/guests'),
      env: baseEnv(DB)
    } as any);

    expect(response.status).toBe(200);
    const payload = JSON.parse(await response.text());
    expect(payload).toHaveLength(1);
    expect(payload[0].email).toBe('guest@example.com');
    expect(calls.some(call => call.query.includes('FROM guests g'))).toBe(true);
  });

  it('updates guest profile via POST action', async () => {
    const { DB, calls } = createMockD1((query, method, params) => {
      if (method === 'first' && query.includes('FROM guests WHERE id = ?')) {
        return { id: 1, email_hash: 'hash', enc_profile: 'enc-profile' };
      }
      if (method === 'run' && query.includes('UPDATE guests SET enc_profile')) {
        return { success: true };
      }
      if (method === 'run' && query.includes('INSERT INTO audit_events')) {
        return { success: true };
      }
      if (method === 'all' && query.includes('FROM magic_links WHERE guest_id = ?')) {
        return { results: [] };
      }
      if (method === 'all' && query.includes('FROM rsvps WHERE guest_id = ?')) {
        return { results: [] };
      }
      return undefined;
    });

    vi.mocked(decryptJson)
      .mockResolvedValueOnce({
        email: 'guest@example.com',
        party: [],
        notes: 'Existing'
      });

    const body = JSON.stringify({
      action: 'update',
      guestId: 1,
      updates: {
        notes: 'Updated'
      }
    });

    const response = await onRequestPost({
      request: new Request('https://example.com/admin/guests', {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'application/json' }
      }),
      env: baseEnv(DB)
    } as any);

    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.success).toBe(true);
    expect(encryptJson).toHaveBeenCalled();
    expect(calls.some(call => call.query.includes('UPDATE guests SET enc_profile'))).toBe(true);
  });


  it('updates event visibility and records audit', async () => {
    const { DB, calls } = createMockD1((query, method, params) => {
      if (method === 'first' && query.includes('FROM guests WHERE id = ?')) {
        return { enc_profile: 'enc-profile', email_hash: 'hash' };
      }
      if (method === 'run' && query.includes('UPDATE guests SET enc_profile')) {
        expect(params?.[2]).toBe(1);
        return { success: true };
      }
      if (method === 'run' && query.includes('INSERT INTO audit_events')) {
        return { success: true };
      }
      return { results: [] };
    });

    vi.mocked(decryptJson).mockResolvedValueOnce({
      email: 'guest@example.com',
      party: [
        { personId: 'primary', role: 'primary', invitedEvents: ['welcome'], attendance: {} }
      ]
    });

    const response = await onRequestPost({
      request: new Request('https://example.com/admin/guests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updateEventVisibility',
          guestId: 1,
          visibility: { welcome: true }
        })
      }),
      env: baseEnv(DB)
    } as any);

    expect(response.status).toBe(200);
    expect(encryptJson).toHaveBeenCalledTimes(1);
    const auditCalls = calls.filter(call => call.query.includes('INSERT INTO audit_events'));
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0].params).toEqual([1, 'event_visibility_updated', expect.any(Number)]);
  });

  it('updates event attendance and logs audit', async () => {
    const { DB, calls } = createMockD1((query, method, params) => {
      if (method === 'first' && query.includes('FROM guests WHERE id = ?')) {
        return { enc_profile: 'enc-profile', email_hash: 'hash' };
      }
      if (method === 'run' && query.includes('UPDATE guests SET enc_profile')) {
        return { success: true };
      }
      if (method === 'run' && query.includes('INSERT INTO audit_events')) {
        return { success: true };
      }
      if (method === 'all' && query.includes('FROM magic_links')) {
        return { results: [] };
      }
      return { results: [] };
    });

    vi.mocked(decryptJson).mockResolvedValueOnce({
      email: 'guest@example.com',
      party: [
        {
          personId: 'primary',
          role: 'primary',
          invitedEvents: ['welcome'],
          attendance: { welcome: { status: 'pending' } }
        }
      ]
    });

    const response = await onRequestPost({
      request: new Request('https://example.com/admin/guests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updateEventAttendance',
          guestId: 1,
          attendance: { eventId: 'welcome', status: 'yes', personId: 'primary' }
        })
      }),
      env: baseEnv(DB)
    } as any);

    expect(response.status).toBe(200);
    expect(encryptJson).toHaveBeenCalled();
    const auditCalls = calls.filter(call => call.query.includes('INSERT INTO audit_events'));
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0].params[1]).toBe('event_attendance_updated');
  });

  it('rejects invalid meal option updates', async () => {
    const { DB, calls } = createMockD1((query, method) => {
      if (method === 'first' && query.includes('FROM guests WHERE id = ?')) {
        return { enc_profile: 'enc-profile', email_hash: 'hash' };
      }
      return { results: [] };
    });

    vi.mocked(decryptJson).mockResolvedValueOnce({
      email: 'guest@example.com',
      party: [
        {
          personId: 'primary',
          role: 'primary',
          invitedEvents: ['welcome'],
          mealSelections: {}
        }
      ]
    });

    const response = await onRequestPost({
      request: new Request('https://example.com/admin/guests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updateMealSelection',
          guestId: 1,
          meal: { eventId: 'welcome', personId: 'primary', mealKey: 'invalid' }
        })
      }),
      env: baseEnv(DB)
    } as any);

    expect(response.status).toBe(400);
    expect(await response.text()).toBe('Invalid meal option');
    expect(calls).toHaveLength(0);
  });

  it('deletes guest and writes audit log', async () => {
    const { DB, calls } = createMockD1((query, method, params) => {
      if (method === 'first' && query.includes('SELECT id FROM guests')) {
        return { id: 3 };
      }
      if (method === 'run' && query.includes('INSERT INTO audit_events')) {
        return { success: true };
      }
      if (method === 'run' && query.includes('DELETE FROM guests')) {
        expect(params?.[0]).toBe(3);
        return { success: true };
      }
      return { results: [] };
    });

    const response = await onRequestPost({
      request: new Request('https://example.com/admin/guests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', guestId: 3 })
      }),
      env: baseEnv(DB)
    } as any);

    expect(response.status).toBe(200);
    const auditCalls = calls.filter(call => call.query.includes('INSERT INTO audit_events'));
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0].params[1]).toBe('guest_deleted');
  });

  it('returns 400 for invalid action', async () => {
    const { DB } = createMockD1(() => ({ results: [] }));

    const response = await onRequestPost({
      request: new Request('https://example.com/admin/guests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unknown', guestId: 1 })
      }),
      env: baseEnv(DB)
    } as any);

    expect(response.status).toBe(400);
    expect(await response.text()).toBe('Invalid action');
  });

  it('logs and returns 500 when update throws', async () => {
    const error = new Error('boom');
    const { DB } = createMockD1((query, method) => {
      if (method === 'first' && query.includes('FROM guests WHERE id = ?')) {
        return { enc_profile: 'enc-profile', email_hash: 'hash' };
      }
      if (method === 'run' && query.includes('UPDATE guests SET enc_profile')) {
        throw error;
      }
      return { results: [] };
    });

    vi.mocked(decryptJson).mockResolvedValueOnce({ email: 'guest@example.com', party: [] });

    const response = await onRequestPost({
      request: new Request('https://example.com/admin/guests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          guestId: 1,
          updates: { notes: 'new' }
        })
      }),
      env: baseEnv(DB)
    } as any);

    expect(response.status).toBe(500);
    await expect(response.text()).resolves.toBe('Internal error');
    const { logError } = await import('../../../src/lib/logger');
    expect(logError).toHaveBeenCalledWith('admin/guests/post', error);
  });
  it('resends invite email when action is resend', async () => {
    const now = Math.floor(Date.now() / 1000);
    const { DB } = createMockD1((query, method) => {
      if (method === 'first' && query.includes('FROM guests WHERE id = ?')) {
        return { id: 1, email_hash: 'hash', enc_profile: 'enc-profile' };
      }
      if (method === 'run' && query.includes('INSERT INTO magic_links')) {
        return { success: true };
      }
      if (method === 'run' && query.includes('INSERT INTO audit_events')) {
        return { success: true };
      }
      if (method === 'first' && query.includes('FROM event WHERE id = 1')) {
        return { enc_details: 'enc-event' };
      }
      if (method === 'all' && query.includes('FROM magic_links WHERE guest_id = ?')) {
        return { results: [] };
      }
      if (method === 'all' && query.includes('FROM rsvps WHERE guest_id = ?')) {
        return { results: [] };
      }
      return undefined;
    });

    vi.mocked(decryptJson)
      .mockResolvedValueOnce({
        email: 'guest@example.com',
        party: []
      })
      .mockResolvedValueOnce({
        inviteEmailSubject: 'Invite Subject'
      });

    const body = JSON.stringify({
      action: 'resend',
      guestId: 1
    });

    const response = await onRequestPost({
      request: new Request('https://example.com/admin/guests', {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'application/json' }
      }),
      env: baseEnv(DB)
    } as any);

    expect(response.status).toBe(200);
    await response.text();
    expect(sendWeddingInvitation).toHaveBeenCalled();
  });
});
