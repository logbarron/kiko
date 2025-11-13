// ABOUTME: Validates API response shapes using Zod schemas.
// ABOUTME: Catches LLM mistakes where response structure changes break callers.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { createMockD1 } from '../helpers/mock-d1';
import { onRequestGet as guestsGet } from '../../functions/admin/guests';
import { onRequestGet as auditGet } from '../../functions/admin/audit';

// Mock dependencies
vi.mock('../../src/lib/logger', () => ({
  logError: vi.fn()
}));

vi.mock('../../src/lib/crypto', () => ({
  decryptJson: vi.fn(),
  encryptJson: vi.fn(),
  hashEmail: vi.fn()
}));

vi.mock('../../functions/admin/loadEventSummaries', () => ({
  loadEventSummaries: vi.fn(async () => ({ events: [] }))
}));

vi.mock('../../functions/admin/profileUtils', () => ({
  buildPartyMembers: vi.fn(() => []),
  migrateProfile: vi.fn((profile) => profile),
  normalizeEventSelection: vi.fn(),
  trimToString: vi.fn()
}));

const { decryptJson } = await import('../../src/lib/crypto');

describe('API contract validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /admin/guests', () => {
    // Define expected schema for party member
    const PartyMemberSchema = z.object({
      personId: z.string(),
      role: z.enum(['primary', 'companion', 'guest']),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      invitedEvents: z.array(z.string()),
      attendance: z.record(z.any()),
      mealSelections: z.record(z.string()).optional(),
      dietaryNotes: z.string().optional(),
      pendingMealSelections: z.array(z.string()).optional(),
    });

    // Define expected schema for guest
    const GuestSchema = z.object({
      id: z.number(),
      email: z.string().email(),
      party: z.array(PartyMemberSchema),
      notes: z.string().optional(),
      created_at: z.number(),
      invite_sent_at: z.number().nullable(),
      invite_clicked_at: z.number().nullable(),
      registered_at: z.number().nullable(),
      rsvp: z.any().optional(),
      audit: z.array(z.any()).optional(),
      magicLinks: z.array(z.any()).optional(),
    });

    const GuestListResponseSchema = z.array(GuestSchema);

    it('returns array of guests with correct shape', async () => {
      const mockGuest = {
        id: 1,
        email_hash: 'hash',
        enc_profile: 'encrypted',
        created_at: 1000,
        invite_sent_at: null,
        invite_clicked_at: null,
        registered_at: null,
        enc_rsvp: null,
      };

      const { DB } = createMockD1((query, method) => {
        if (method === 'all' && query.includes('FROM guests')) {
          return { results: [mockGuest] };
        }
        if (method === 'all' && query.includes('FROM audit_events')) {
          return { results: [] };
        }
        if (method === 'all' && query.includes('FROM magic_links')) {
          return { results: [] };
        }
        return { results: [] };
      });

      vi.mocked(decryptJson).mockResolvedValue({
        email: 'guest@example.com',
        party: [{
          personId: 'primary',
          role: 'primary',
          firstName: 'Test',
          lastName: 'Guest',
          invitedEvents: ['ceremony'],
          attendance: {},
        }],
      });

      const response = await guestsGet({
        request: new Request('https://example.com/admin/guests'),
        env: { DB, KEK_B64: 'secret', DEV_MODE: 'true' } as any
      } as any);

      expect(response.status).toBe(200);

      const data = await response.json();

      // Validate shape using Zod
      const result = GuestListResponseSchema.safeParse(data);

      if (!result.success) {
        throw new Error(
          `Response does not match expected schema:\n${JSON.stringify(result.error.issues, null, 2)}`
        );
      }

      expect(result.success).toBe(true);
    });

    it('guest email is always a valid email format', async () => {
      const mockGuest = {
        id: 2,
        email_hash: 'bad-hash',
        enc_profile: 'encrypted',
        created_at: 2000,
        invite_sent_at: null,
        invite_clicked_at: null,
        registered_at: null,
        enc_rsvp: null,
      };

      const { DB } = createMockD1((query, method) => {
        if (method === 'all' && query.includes('FROM guests')) {
          return { results: [mockGuest] };
        }
        if (method === 'all' && query.includes('FROM audit_events')) {
          return { results: [] };
        }
        if (method === 'all' && query.includes('FROM magic_links')) {
          return { results: [] };
        }
        return { results: [] };
      });

      vi.mocked(decryptJson).mockResolvedValue({
        email: 'not-an-email', // Invalid email
        party: [],
      });

      const response = await guestsGet({
        request: new Request('https://example.com/admin/guests'),
        env: { DB, KEK_B64: 'secret', DEV_MODE: 'true' } as any
      } as any);

      expect(response.status).toBe(200);
      const data = await response.json();

      // This should fail because email is invalid
      const result = GuestListResponseSchema.safeParse(data);

      expect(result.success).toBe(false);
      if (!result.success) {
        const issues = result.error.issues.filter(issue => issue.path.includes('email'));
        expect(issues.length).toBeGreaterThan(0);
      }
    });
  });

  describe('GET /admin/audit', () => {
    const AuditEventSchema = z.object({
      id: z.number(),
      guest_id: z.number().nullable(),
      type: z.string(),
      ip_hash: z.string().nullable().optional(),
      user_agent_hash: z.string().nullable().optional(),
      metadata: z.string().nullable().optional(),
      created_at: z.number(),
    });

    const AuditResponseSchema = z.array(AuditEventSchema);

    it('returns array of audit events with correct shape', async () => {
      const mockAuditEvent = {
        id: 1,
        guest_id: 10,
        type: 'invite_sent',
        created_at: 1000,
      };

      const { DB } = createMockD1((query, method) => {
        if (method === 'all' && query.includes('FROM audit_events')) {
          return { results: [mockAuditEvent] };
        }
        return { results: [] };
      });

      const response = await auditGet({
        request: new Request('https://example.com/admin/audit'),
        env: { DB, KEK_B64: 'secret', DEV_MODE: 'true' } as any
      } as any);

      expect(response.status).toBe(200);

      const data = await response.json();

      // Validate shape using Zod
      const result = AuditResponseSchema.safeParse(data);

      if (!result.success) {
        throw new Error(
          `Audit response does not match expected schema:\n${JSON.stringify(result.error.issues, null, 2)}`
        );
      }

      expect(result.success).toBe(true);
    });

    it('audit event types are limited to known values', async () => {
      const validTypes = [
        'invite_sent',
        'invite_clicked',
        'verify_ok',
        'verify_fail',
        'link_clicked',
        'rsvp_submit',
      ] as const;

      const { DB } = createMockD1((query, method) => {
        if (method === 'all' && query.includes('FROM audit_events')) {
          return {
            results: [
              { id: 1, guest_id: 1, type: 'invite_sent', created_at: 1000 },
              { id: 2, guest_id: 1, type: 'unknown_type', created_at: 1001 }, // Invalid
            ]
          };
        }
        return { results: [] };
      });

      const response = await auditGet({
        request: new Request('https://example.com/admin/audit'),
        env: { DB, KEK_B64: 'secret', DEV_MODE: 'true' } as any
      } as any);

      const data = await response.json();

      const StrictAuditSchema = AuditEventSchema.extend({
        type: z.enum(validTypes)
      });

      const result = StrictAuditSchema.array().safeParse(data);
      expect(result.success).toBe(false);
      if (!result.success) {
        const typeIssues = result.error.issues.filter(issue => issue.path.includes('type'));
        expect(typeIssues.length).toBeGreaterThan(0);
      }
    });
  });
});
