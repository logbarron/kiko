// ABOUTME: Verifies admin guests GET decrypts profiles with real crypto.
// ABOUTME: Guards against plaintext storage regressions.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockD1 } from '../../helpers/mock-d1';

const TEST_KEK_B64 = Buffer.from('0123456789abcdef0123456789abcdef').toString('base64');

describe('admin guests handler with real crypto', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns decrypted guest profiles without exposing plaintext in storage', async () => {
    vi.doMock('../../../src/lib/logger', () => ({
      logError: vi.fn()
    }));

    vi.doMock('../../../src/lib/access', () => ({
      requireAccessAssertion: vi.fn(async () => ({ sub: 'admin' }))
    }));

    vi.doMock('../../../functions/admin/loadEventSummaries', () => ({
      loadEventSummaries: vi.fn(async () => ({
        events: [
          { id: 'welcome', requiresMealSelection: true }
        ]
      }))
    }));

    vi.doMock('../../../functions/admin/profileUtils', () => ({
      buildPartyMembers: vi.fn((profile: any) => profile.party ?? []),
      migrateProfile: vi.fn((profile: any) => profile),
      normalizeEventSelection: vi.fn(),
      trimToString: vi.fn()
    }));

    const cryptoActual = await vi.importActual<typeof import('../../../src/lib/crypto')>(
      '../../../src/lib/crypto'
    );

    vi.doMock('../../../src/lib/crypto', () => ({
      ...cryptoActual,
      decryptJson: vi.fn((...args: Parameters<typeof cryptoActual.decryptJson>) =>
        cryptoActual.decryptJson(...args)
      )
    }));

    const { decryptJson, encryptJson, hashEmail } = await import('../../../src/lib/crypto');
    const { onRequestGet } = await import('../../../functions/admin/guests');

    const emailHash = await hashEmail('guest@example.com', TEST_KEK_B64);
    const guestProfile = {
      email: 'guest@example.com',
      party: [
        {
          personId: 'primary',
          role: 'primary',
          firstName: 'Test',
          invitedEvents: ['welcome'],
          attendance: {}
        }
      ],
      notes: 'Bring sunscreen'
    };

    const encryptedProfile = await encryptJson(
      guestProfile,
      TEST_KEK_B64,
      'guests',
      emailHash,
      'profile'
    );

    const { DB, calls } = createMockD1((query, method) => {
      if (method === 'all' && query.includes('FROM guests g')) {
        return {
          results: [
            {
              id: 1,
              email_hash: emailHash,
              enc_profile: encryptedProfile,
              created_at: 100,
              invite_sent_at: null,
              invite_clicked_at: null,
              registered_at: null,
              enc_rsvp: null,
              rsvp_updated: null
            }
          ]
        };
      }
      if (method === 'all' && query.includes('FROM audit_events')) {
        return { results: [] };
      }
      if (method === 'all' && query.includes('FROM magic_links')) {
        return { results: [] };
      }
      if (method === 'all' && query.includes('FROM rsvps')) {
        return { results: [] };
      }
      if (method === 'all' && query.includes('FROM sessions')) {
        return { results: [] };
      }
      return { results: [] };
    });

    const env = {
      DB,
      KEK_B64: TEST_KEK_B64,
      DEV_MODE: 'true'
    } as any;

    const response = await onRequestGet({
      request: new Request('https://example.com/admin/guests'),
      env
    } as any);

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(Array.isArray(payload)).toBe(true);
    expect(payload).toHaveLength(1);
    const [guest] = payload;
    expect(guest.email).toBe('guest@example.com');
    expect(guest.notes).toBe('Bring sunscreen');
    expect(guest.party[0]?.invitedEvents).toEqual(['welcome']);

    expect(decryptJson).toHaveBeenCalledWith(
      encryptedProfile,
      TEST_KEK_B64,
      'guests',
      emailHash,
      'profile'
    );
    expect(
      calls.some(call => call.query.includes('FROM guests g') && call.method === 'all')
    ).toBe(true);
  });
});

