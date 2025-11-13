const toEnv = (DB: unknown) =>
  ({
    DB,
    KEK_B64: 'secret',
    DEV_MODE: 'true'
  }) as any;

// ABOUTME: Exercises admin event read/write endpoints.
// ABOUTME: Confirms validation, persistence, and audit logging behavior.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onRequestPost, onRequestGet } from '../../../functions/admin/event';
import { createMockD1 } from '../../helpers/mock-d1';

vi.mock('../../../src/lib/logger', () => ({
  logError: vi.fn()
}));

vi.mock('../../../src/lib/crypto', () => ({
  encryptJson: vi.fn(async (_data: unknown) => 'encrypted-payload'),
  decryptJson: vi.fn()
}));

const { encryptJson, decryptJson } = await import('../../../src/lib/crypto');

describe('admin event post handler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-07-01T12:00:00Z'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('validates input and returns 400 when required fields missing', async () => {
    const { DB } = createMockD1(() => ({ results: [] }));

    const response = await onRequestPost({
      request: new Request('https://example.com/admin/event', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' }
      }),
      env: toEnv(DB)
    } as any);

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.errors).toContain('siteTitle is required');
    expect(payload.errors).toContain('dateISO must be a valid ISO date');
  });

  it('persists normalized event details and logs audit entry', async () => {
    const { DB, calls } = createMockD1((query, method, params) => {
      if (method === 'first' && query.includes('SELECT id FROM event')) {
        return { id: 1 };
      }
      if (method === 'run' && query.startsWith('UPDATE event')) {
        expect(params?.[0]).toBe('encrypted-payload');
        return { success: true };
      }
      if (method === 'run' && query.includes('INSERT INTO audit_events')) {
        return { success: true };
      }
      return { success: true };
    });

    const payload = {
      siteTitle: 'Summer Celebration',
      heroHeadline: 'Join Us',
      dateISO: '2024-08-15T00:00:00.000Z',
      timeZone: 'UTC',
      events: [
        {
          id: 'welcome',
          label: 'Welcome Party',
          startISO: '2024-08-15T18:00:00.000Z',
          endISO: '2024-08-15T22:00:00.000Z',
          venue: {
            name: 'Palm Beach Pavilion',
            geo: 'Palm Beach, FL',
            address: ['123 Beach Ave']
          },
          requiresMealSelection: true,
          mealOptions: ['Fish']
        }
      ],
      accommodations: [],
      registry: []
    };

    const response = await onRequestPost({
      request: new Request('https://example.com/admin/event', {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' }
      }),
      env: toEnv(DB)
    } as any);

    expect(response.status).toBe(200);
    await response.json();

    expect(encryptJson).toHaveBeenCalledWith(
      expect.objectContaining({
        siteTitle: 'Summer Celebration',
        events: expect.any(Array)
      }),
      'secret',
      'event',
      '1',
      'details'
    );

    const auditCalls = calls.filter(call => call.query.includes('INSERT INTO audit_events'));
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0].params).toEqual(['event_updated', expect.any(Number)]);
  });

  it('creates event record when none exists', async () => {
    const { DB, calls } = createMockD1((query, method, params) => {
      if (method === 'first' && query.includes('SELECT id FROM event')) {
        return null;
      }
      if (method === 'run' && query.startsWith('INSERT INTO event')) {
        expect(params?.[0]).toBe('encrypted-payload');
        return { success: true };
      }
      if (method === 'run' && query.includes('INSERT INTO audit_events')) {
        return { success: true };
      }
      return { success: true };
    });

    const payload = {
      siteTitle: 'New Event',
      dateISO: '2024-09-01T00:00:00.000Z',
      timeZone: 'UTC',
      events: [],
      accommodations: [],
      registry: []
    };

    const response = await onRequestPost({
      request: new Request('https://example.com/admin/event', {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' }
      }),
      env: toEnv(DB)
    } as any);

    expect(response.status).toBe(200);
    await response.json();

    const insertCalls = calls.filter(call => call.query.startsWith('INSERT INTO event'));
    expect(insertCalls).toHaveLength(1);
    const auditCalls = calls.filter(call => call.query.includes('INSERT INTO audit_events'));
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0].params).toEqual(['event_updated', expect.any(Number)]);
  });

  it('returns 500 and logs when update fails', async () => {
    const error = new Error('db failure');
    const { DB } = createMockD1((query, method) => {
      if (method === 'first' && query.includes('SELECT id FROM event')) {
        return { id: 1 };
      }
      if (method === 'run' && query.startsWith('UPDATE event')) {
        throw error;
      }
      return { success: true };
    });

    const payload = {
      siteTitle: 'Summer Celebration',
      dateISO: '2024-08-15T00:00:00.000Z',
      timeZone: 'UTC',
      events: [],
      accommodations: [],
      registry: []
    };

    const response = await onRequestPost({
      request: new Request('https://example.com/admin/event', {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' }
      }),
      env: toEnv(DB)
    } as any);

    expect(response.status).toBe(500);
    await expect(response.text()).resolves.toBe('Internal error');
    const { logError } = await import('../../../src/lib/logger');
    expect(logError).toHaveBeenCalledWith('admin/event/post', error);
  });

  it('rejects invalid meal options when selection required', async () => {
    const { DB, calls } = createMockD1(() => ({ results: [] }));

    const payload = {
      siteTitle: 'Event',
      dateISO: '2024-08-15T00:00:00.000Z',
      timeZone: 'UTC',
      events: [
        {
          id: 'welcome',
          label: 'Welcome Party',
          startISO: '2024-08-15T18:00:00.000Z',
          requiresMealSelection: true,
          mealOptions: []
        }
      ],
      accommodations: [],
      registry: []
    };

    const response = await onRequestPost({
      request: new Request('https://example.com/admin/event', {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' }
      }),
      env: toEnv(DB)
    } as any);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.errors).toContain(
      'events[0].mealOptions must include at least one value when requiresMealSelection is true'
    );
    expect(calls).toHaveLength(0);
  });
});

describe('admin event get handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads event details when record exists', async () => {
    const { DB, calls } = createMockD1((query, method) => {
      if (method === 'first' && query.includes('SELECT enc_details, updated_at FROM event')) {
        return { enc_details: 'enc-event', updated_at: 123 };
      }
      return { results: [] };
    });

    const details = { siteTitle: 'Site', schemaVersion: 6, events: [] };
    vi.mocked(decryptJson).mockResolvedValueOnce(details);

    const response = await onRequestGet({
      request: new Request('https://example.com/admin/event'),
      env: toEnv(DB)
    } as any);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.objectContaining({ siteTitle: 'Site' }));
    expect(calls.some(call => call.query.includes('SELECT enc_details'))).toBe(true);
  });

  it('returns seeded empty state when no event record exists', async () => {
    const { DB } = createMockD1(() => null);

    const response = await onRequestGet({
      request: new Request('https://example.com/admin/event'),
      env: toEnv(DB)
    } as any);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.siteTitle).toBe('');
    expect(Array.isArray(body.events)).toBe(true);
    expect(body.events).toHaveLength(0);
    expect(typeof body.updatedAt).toBe('number');
  });
});
