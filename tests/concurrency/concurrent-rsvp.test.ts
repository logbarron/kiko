// ABOUTME: Tests concurrent RSVP submissions for race conditions.
// ABOUTME: Catches LLM mistakes where sequential code breaks under parallel load.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockD1 } from '../helpers/mock-d1';
import { onRequestPost } from '../../functions/rsvp';

// Mock dependencies
vi.mock('../../src/lib/cookies', () => ({
  validateSession: vi.fn()
}));

vi.mock('../../src/lib/crypto', () => ({
  decryptJson: vi.fn(),
  encryptJson: vi.fn(async () => 'encrypted')
}));

vi.mock('../../src/lib/logger', () => ({
  logError: vi.fn()
}));

const { validateSession } = await import('../../src/lib/cookies');
const { decryptJson, encryptJson } = await import('../../src/lib/crypto');

describe('Concurrent RSVP submission safety', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-10-08T00:00:00Z'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('handles 10 concurrent RSVP submissions without data corruption', async () => {
    let guestUpdateCount = 0;
    let rsvpInsertCount = 0;
    let auditInsertCount = 0;

    const { DB, calls } = createMockD1((query, method, params) => {
      if (method === 'first' && query.includes('FROM guests WHERE id')) {
        return { enc_profile: 'enc-profile', email_hash: 'hash' };
      }
      if (method === 'first' && query.includes('FROM event WHERE id = 1')) {
        return { enc_details: 'enc-event' };
      }
      if (method === 'run' && query.includes('UPDATE guests SET enc_profile')) {
        guestUpdateCount++;
        return { success: true };
      }
      if (method === 'run' && query.includes('INSERT INTO rsvps')) {
        rsvpInsertCount++;
        return { success: true };
      }
      if (method === 'run' && query.includes('INSERT INTO audit_events')) {
        auditInsertCount++;
        return { success: true };
      }
      return { success: true };
    });

    const now = Math.floor(Date.now() / 1000);

    vi.mocked(validateSession).mockResolvedValue({
      id: 1,
      guest_id: 7,
      session_id_hash: 'hash',
      created_at: now - 100,
      expires_at: now + 3600,
      last_seen_at: now - 10
    });

    vi.mocked(decryptJson).mockImplementation(async (encrypted) => {
      if (encrypted === 'enc-profile') {
        return {
          email: 'guest@example.com',
          party: [{
            personId: 'primary',
            role: 'primary',
            invitedEvents: ['dinner'],
            attendance: {},
          }]
        };
      }
      if (encrypted === 'enc-event') {
        return { events: [{ id: 'dinner', requiresMealSelection: true }] };
      }
      return {};
    });

    const buildRequest = () => new Request('https://example.com/rsvp', {
      method: 'POST',
      headers: {
        'Cookie': '__Host-s=valid-session',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        partyResponses: JSON.stringify({
          primary: {
            events: { dinner: { status: 'yes' } }
          }
        })
      })
    });

    // Create 10 parallel requests
    const requests = Array.from({ length: 10 }, () =>
      onRequestPost({
        request: buildRequest(),
        env: {
          DB,
          KEK_B64: 'secret',
          SESSION_IDLE_MIN: '30',
          SESSION_ABSOLUTE_HOURS: '24',
          DEV_MODE: 'true'
        } as any,
        data: {}
      } as any)
    );

    // Execute all requests in parallel
    const responses = await Promise.all(requests);

    const payloads = await Promise.all(
      responses.map(async (response) => ({
        status: response.status,
        body: await response.clone().json()
      }))
    );

    payloads.forEach(({ status, body }) => {
      expect(status).toBe(200);
      expect(body).toEqual({ success: true, pendingMealEvents: ['dinner'] });
    });
    expect(payloads).toHaveLength(10);

    // Verify database operations were called the expected number of times.
    expect(guestUpdateCount).toBe(10);
    expect(rsvpInsertCount).toBe(10);
    expect(auditInsertCount).toBe(20);

    const auditCalls = calls.filter(call => call.query.includes('INSERT INTO audit_events'));
    expect(auditCalls).toHaveLength(20);
    expect(auditCalls.filter(call => call.params[1] === 'rsvp_submit')).toHaveLength(10);
    expect(auditCalls.filter(call => call.params[1] === 'event_attendance_updated')).toHaveLength(10);
    auditCalls.forEach(call => {
      expect(call.params[0]).toBe(7);
      expect(call.params[2]).toBe(now);
    });

    const guestUpdateCalls = calls.filter(call => call.query.includes('UPDATE guests SET enc_profile'));
    expect(guestUpdateCalls).toHaveLength(10);
    guestUpdateCalls.forEach(call => {
      expect(call.params).toEqual(['encrypted', now, 7]);
      expect(call.query).toContain('WHERE id = ?');
    });

    const rsvpCalls = calls.filter(call => call.query.includes('INSERT INTO rsvps'));
    expect(rsvpCalls).toHaveLength(10);
    rsvpCalls.forEach(call => {
      expect(call.params).toEqual([7, 'encrypted', now]);
      expect(call.query).toContain('ON CONFLICT(guest_id)');
    });

    // Verify encryptJson payloads retained per-request pending meal state.
    const encryptCalls = vi.mocked(encryptJson).mock.calls;
    const profilePayloads = encryptCalls
      .filter(([, , table]) => table === 'guests')
      .map(([payload]) => payload as any);
    const rsvpPayloads = encryptCalls
      .filter(([, , table]) => table === 'rsvps')
      .map(([payload]) => payload as any);

    expect(profilePayloads).toHaveLength(10);
    profilePayloads.forEach(profile => {
      expect(profile.party[0]?.pendingMealSelections).toEqual(['dinner']);
    });

    expect(rsvpPayloads).toHaveLength(10);
    rsvpPayloads.forEach(record => {
      expect(record.partyResponses.primary.pendingMealSelections).toEqual(['dinner']);
      expect(record.partyResponses.primary.events.dinner.status).toBe('yes');
    });

    // Verify encryptJson was called for each submission (profile + RSVP)
    expect(vi.mocked(encryptJson)).toHaveBeenCalledTimes(20);
  });

  it('handles concurrent updates gracefully when session expires mid-request', async () => {
    const now = Math.floor(Date.now() / 1000);

    const { DB, calls } = createMockD1((query, method) => {
      if (method === 'first' && query.includes('FROM guests WHERE id')) {
        return { enc_profile: 'enc-profile', email_hash: 'hash' };
      }
      if (method === 'first' && query.includes('FROM event WHERE id = 1')) {
        return { enc_details: 'enc-event' };
      }
      return { success: true };
    });

    // First 5 requests get valid session, next 5 get expired session
    let callCount = 0;
    vi.mocked(validateSession).mockImplementation(async () => {
      callCount++;
      if (callCount <= 5) {
        return {
          id: 1,
          guest_id: 7,
          session_id_hash: 'hash',
          created_at: now - 100,
          expires_at: now + 3600,
          last_seen_at: now - 10
        };
      }
      return null; // Expired session
    });

    vi.mocked(decryptJson).mockResolvedValue({
      email: 'guest@example.com',
      party: [{
        personId: 'primary',
        role: 'primary',
        invitedEvents: ['dinner'],
        attendance: {},
      }]
    });

    const buildRequest = () => new Request('https://example.com/rsvp', {
      method: 'POST',
      headers: {
        'Cookie': '__Host-s=valid-session',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        partyResponses: JSON.stringify({
          primary: { events: { dinner: { status: 'yes' } } }
        })
      })
    });

    const requests = Array.from({ length: 10 }, () =>
      onRequestPost({
        request: buildRequest(),
        env: {
          DB,
          KEK_B64: 'secret',
          SESSION_IDLE_MIN: '30',
          SESSION_ABSOLUTE_HOURS: '24',
          DEV_MODE: 'true'
        } as any,
        data: {}
      } as any)
    );

    const responses = await Promise.all(requests);

    // First 5 should succeed, next 5 should fail with 401
    const successCount = responses.filter(r => r.status === 200).length;
    const unauthorizedCount = responses.filter(r => r.status === 401).length;

    expect(successCount).toBe(5);
    expect(unauthorizedCount).toBe(5);

    // Ensure we short-circuited encryption for unauthorized requests.
    expect(vi.mocked(encryptJson)).toHaveBeenCalledTimes(10); // 5 successes -> 10 encryptions

    const auditCalls = calls.filter(call => call.query.includes('INSERT INTO audit_events'));
    const submitCalls = auditCalls.filter(call => call.params[1] === 'rsvp_submit');
    const attendanceCalls = auditCalls.filter(call => call.params[1] === 'event_attendance_updated');

    expect(submitCalls).toHaveLength(successCount);
    expect(attendanceCalls.length).toBeGreaterThanOrEqual(1);
    expect(attendanceCalls.length).toBeLessThanOrEqual(successCount);
    auditCalls.forEach(call => {
      expect(call.params[0]).toBe(7);
    });

    const profilePayloads = vi.mocked(encryptJson).mock.calls
      .filter(([, , table]) => table === 'guests')
      .map(([payload]) => payload as any);
    expect(profilePayloads).toHaveLength(successCount);
    profilePayloads.forEach(profile => {
      expect(profile.party[0]?.attendance.dinner.status).toBe('yes');
    });

    const guestUpdateCalls = calls.filter(call => call.query.includes('UPDATE guests SET enc_profile'));
    expect(guestUpdateCalls).toHaveLength(5);
    guestUpdateCalls.forEach(call => {
      expect(call.params[2]).toBe(7);
      expect(call.query).toContain('WHERE id = ?');
    });

    const rsvpCalls = calls.filter(call => call.query.includes('INSERT INTO rsvps'));
    expect(rsvpCalls).toHaveLength(5);
    rsvpCalls.forEach(call => {
      expect(call.params[0]).toBe(7);
      expect(call.query).toContain('ON CONFLICT(guest_id)');
    });
  });
});
