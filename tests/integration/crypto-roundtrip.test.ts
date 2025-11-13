// ABOUTME: Verifies ciphertext written by one admin handler decrypts in another.
// ABOUTME: Uses real crypto helpers to catch schema or KEK drift.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockD1 } from '../helpers/mock-d1';

const TEST_KEK_B64 = Buffer.from('0123456789abcdef0123456789abcdef').toString('base64');

const toEnv = (DB: unknown) =>
  ({
    DB,
    KEK_B64: TEST_KEK_B64,
    DEV_MODE: 'true',
    ACCESS_AUD: 'audience',
    ACCESS_JWT_ISS: 'https://example.cloudflareaccess.com'
  }) as any;

describe('encryption roundtrip across admin event handlers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('event details encrypted on POST decrypt correctly on GET', async () => {
    vi.doMock('../../src/lib/access', () => ({
      requireAccessAssertion: vi.fn(async () => ({ sub: 'admin', email: 'admin@example.com' }))
    }));
    vi.doMock('../../src/lib/crypto', async () =>
      vi.importActual<typeof import('../../src/lib/crypto')>('../../src/lib/crypto')
    );

    const { onRequestPost, onRequestGet } = await import('../../functions/admin/event');
    const { requireAccessAssertion } = await import('../../src/lib/access');

    let storedEncDetails: string | null = null;
    let storedUpdatedAt = Math.floor(Date.now() / 1000);

    const { DB, calls } = createMockD1((query, method, params) => {
      if (method === 'first' && query.includes('SELECT id FROM event')) {
        return { id: 1 };
      }
      if (method === 'run' && query.startsWith('UPDATE event')) {
        storedEncDetails = params?.[0] as string;
        storedUpdatedAt = params?.[1] as number;
        return { success: true };
      }
      if (method === 'run' && query.startsWith('INSERT INTO event')) {
        storedEncDetails = params?.[0] as string;
        storedUpdatedAt = params?.[1] as number;
        return { success: true };
      }
      if (method === 'first' && query.includes('SELECT enc_details')) {
        if (!storedEncDetails) {
          return null;
        }
        return { enc_details: storedEncDetails, updated_at: storedUpdatedAt };
      }
      if (method === 'run' && query.includes('INSERT INTO audit_events')) {
        return { success: true };
      }
      return { results: [] };
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
          requiresMealSelection: true,
          mealOptions: ['Fish', 'Veg']
        }
      ],
      accommodations: [],
      registry: []
    };

    const postResponse = await onRequestPost({
      request: new Request('https://example.com/admin/event', {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' }
      }),
      env: toEnv(DB)
    } as any);

    expect(postResponse.status).toBe(200);
    expect(requireAccessAssertion).toHaveBeenCalledTimes(1);
    expect(typeof storedEncDetails).toBe('string');
    expect(storedEncDetails).not.toContain('Summer Celebration');
    expect(storedEncDetails).not.toContain('Welcome Party');

    const getResponse = await onRequestGet({
      request: new Request('https://example.com/admin/event'),
      env: toEnv(DB)
    } as any);

    expect(getResponse.status).toBe(200);
    expect(requireAccessAssertion).toHaveBeenCalledTimes(2);

    const details = await getResponse.json();
    expect(details.siteTitle).toBe('Summer Celebration');
    expect(details.events).toHaveLength(1);
    expect(details.events[0]?.mealOptions).toEqual(['Fish', 'Veg']);

    expect(calls.some(call => call.query.includes('UPDATE event SET enc_details'))).toBe(true);
    expect(calls.some(call => call.query.includes('SELECT enc_details'))).toBe(true);
  });
});
