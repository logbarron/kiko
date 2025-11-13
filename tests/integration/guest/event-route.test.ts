// ABOUTME: Covers the guest event page handler.
// ABOUTME: Verifies redirects, error handling, and successful page rendering.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onRequestGet } from '../../../functions/event';
import { createMockD1 } from '../../helpers/mock-d1';

vi.mock('../../../src/lib/cookies', () => ({
  validateSession: vi.fn()
}));

vi.mock('../../../src/lib/crypto', () => ({
  decryptJson: vi.fn()
}));

vi.mock('../../../src/views/event', () => ({
  renderEventPage: vi.fn(() => 'rendered-html')
}));

vi.mock('../../../src/lib/logger', () => ({
  logError: vi.fn()
}));

const { validateSession } = await import('../../../src/lib/cookies');
const { decryptJson } = await import('../../../src/lib/crypto');
const { renderEventPage } = await import('../../../src/views/event');
const { logError } = await import('../../../src/lib/logger');

describe('event handler GET', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-02-01T12:00:00Z'));
    vi.clearAllMocks();
    vi.mocked(renderEventPage).mockReturnValue('rendered-html');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const baseEnvValues = {
    KEK_B64: 'secret',
    SESSION_IDLE_MIN: '30',
    SESSION_ABSOLUTE_HOURS: '24'
  };

  it('redirects to /invite when no cookie is present', async () => {
    const { DB } = createMockD1(() => undefined);
    const response = await onRequestGet({
      request: new Request('https://example.com/event'),
      env: { ...baseEnvValues, DB },
      data: { nonce: 'nonce' }
    } as any);

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/invite');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(validateSession).not.toHaveBeenCalled();
  });

  it('redirects to /invite when session validation fails', async () => {
    const { DB } = createMockD1(() => undefined);
    vi.mocked(validateSession).mockResolvedValue(null);

    const response = await onRequestGet({
      request: new Request('https://example.com/event', { headers: { Cookie: '__Host-s=session' } }),
      env: { ...baseEnvValues, DB },
      data: { nonce: 'nonce' }
    } as any);

    expect(validateSession).toHaveBeenCalled();
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/invite');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('returns 500 when event configuration is missing', async () => {
    const { DB } = createMockD1((query, method) => {
      if (method === 'first' && query.includes('FROM guests WHERE id')) {
        return { enc_profile: 'enc-profile', email_hash: 'hash' };
      }
      if (method === 'first' && query.includes('FROM rsvps')) {
        return null;
      }
      if (method === 'first' && query.includes('FROM event WHERE id = 1')) {
        return null;
      }
      return undefined;
    });

    vi.mocked(validateSession).mockResolvedValue({
      id: 1,
      guest_id: 7,
      session_id_hash: 'hash',
      created_at: 0,
      expires_at: 999999,
      last_seen_at: 0
    });
    vi.mocked(decryptJson).mockResolvedValue({ email: 'guest@example.com', party: [] });

    const request = new Request('https://example.com/event', {
      headers: { Cookie: '__Host-s=token' }
    });

    const response = await onRequestGet({
      request,
      env: { ...baseEnvValues, DB },
      data: { nonce: 'nonce' }
    } as any);

    expect(response.status).toBe(500);
    expect(renderEventPage).not.toHaveBeenCalled();
    await expect(response.text()).resolves.toBe('Event not found');
    expect(logError).not.toHaveBeenCalled();
  });

  it('renders the event page when session and data are valid', async () => {
    const guestProfile = {
      email: 'guest@example.com',
      party: [
        {
          personId: 'primary',
          role: 'primary',
          firstName: 'Taylor',
          lastName: 'Guest',
          invitedEvents: ['welcome'],
          attendance: {}
        }
      ]
    };

    const eventDetails = {
      siteTitle: '  Celebration  ',
      heroHeadline: 'Welcome Friends',
      dateISO: '2024-05-01T00:00:00Z',
      timeZone: 'UTC',
      events: [
        {
          id: 'welcome',
          label: 'Welcome Party',
          venue: { name: 'The Hall', address: ['123 Street'] }
        }
      ]
    } as any;

    const { DB } = createMockD1((query, method) => {
      if (method === 'first' && query.includes('FROM guests WHERE id')) {
        return { enc_profile: 'enc-profile', email_hash: 'hash' };
      }
      if (method === 'first' && query.includes('FROM rsvps WHERE guest_id')) {
        return null;
      }
      if (method === 'first' && query.includes('FROM event WHERE id = 1')) {
        return { enc_details: 'enc-event' };
      }
      return undefined;
    });

    vi.mocked(validateSession).mockResolvedValue({
      id: 2,
      guest_id: 7,
      session_id_hash: 'hash',
      created_at: 0,
      expires_at: 999999,
      last_seen_at: 0
    });

    vi.mocked(decryptJson)
      .mockResolvedValueOnce(guestProfile)
      .mockResolvedValueOnce(eventDetails);

    const request = new Request('https://example.com/event', {
      headers: { Cookie: '__Host-s=token' }
    });

    const env = { ...baseEnvValues, DB };

    const response = await onRequestGet({
      request,
      env,
      data: { nonce: 'nonce' }
    } as any);

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('rendered-html');

    expect(renderEventPage).toHaveBeenCalledTimes(1);
    const viewModel = vi.mocked(renderEventPage).mock.calls[0]?.[0];
    expect(viewModel.title).toBe('Celebration');
    expect(viewModel.guest.members).toHaveLength(1);
    expect(viewModel.events[0].label).toBe('Welcome Party');
    expect(vi.mocked(renderEventPage).mock.calls[0]?.[1]).toBe('nonce');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('includes RSVP metadata when previous submission exists', async () => {
    const nowIso = '2024-02-01T12:00:00Z';
    const guestProfile = {
      email: 'guest@example.com',
      party: [
        {
          personId: 'primary',
          role: 'primary',
          firstName: 'Alex',
          lastName: 'Guest',
          invitedEvents: ['dinner'],
          attendance: {
            dinner: { status: 'yes' }
          }
        }
      ]
    };

    const rsvpRecord = {
      partyResponses: {
        primary: {
          events: { dinner: { status: 'yes' } }
        }
      },
      submittedAt: nowIso
    };

    const eventDetails = {
      dateISO: '2024-06-01T17:00:00Z',
      timeZone: 'UTC',
      events: [
        {
          id: 'dinner',
          label: 'Dinner Reception',
          venue: { name: 'Ballroom', address: ['123 Street'] }
        }
      ]
    } as any;

    const { DB } = createMockD1((query, method) => {
      if (method === 'first' && query.includes('FROM guests WHERE id')) {
        return { enc_profile: 'enc-profile', email_hash: 'hash' };
      }
      if (method === 'first' && query.includes('FROM rsvps WHERE guest_id')) {
        return { enc_rsvp: 'enc-rsvp' };
      }
      if (method === 'first' && query.includes('FROM event WHERE id = 1')) {
        return { enc_details: 'enc-event' };
      }
      return undefined;
    });

    vi.mocked(validateSession).mockResolvedValue({
      id: 3,
      guest_id: 8,
      session_id_hash: 'hash',
      created_at: 0,
      expires_at: 999999,
      last_seen_at: 0
    });

    vi.mocked(decryptJson)
      .mockResolvedValueOnce(guestProfile)
      .mockResolvedValueOnce(rsvpRecord)
      .mockResolvedValueOnce(eventDetails);

    const request = new Request('https://example.com/event', {
      headers: { Cookie: '__Host-s=session' }
    });

    const response = await onRequestGet({
      request,
      env: { ...baseEnvValues, DB },
      data: { nonce: 'nonce' }
    } as any);

    expect(response.status).toBe(200);
    await response.text();

    const lastCall = vi.mocked(renderEventPage).mock.calls.at(-1) || [];
    const [viewModel] = lastCall;
    expect(viewModel.rsvp.submittedAtText).toBeDefined();
    expect(viewModel.events[0].attendees[0].attendanceStatus).toBe('yes');
  });

  it('logs and returns 500 when rendering fails', async () => {
    const { DB } = createMockD1((query, method) => {
      if (method === 'first' && query.includes('FROM guests WHERE id')) {
        return { enc_profile: 'enc-profile', email_hash: 'hash' };
      }
      if (method === 'first' && query.includes('FROM rsvps WHERE guest_id')) {
        return null;
      }
      if (method === 'first' && query.includes('FROM event WHERE id = 1')) {
        return { enc_details: 'enc-event' };
      }
      return undefined;
    });

    vi.mocked(validateSession).mockResolvedValue({
      id: 4,
      guest_id: 10,
      session_id_hash: 'hash',
      created_at: 0,
      expires_at: 999999,
      last_seen_at: 0
    });

    const request = new Request('https://example.com/event', {
      headers: { Cookie: '__Host-s=session' }
    });

    vi.mocked(decryptJson)
      .mockResolvedValueOnce({ email: 'guest@example.com', party: [] })
      .mockResolvedValueOnce({
        partyResponses: {},
        submittedAt: '2024-01-01T00:00:00Z'
      })
      .mockResolvedValueOnce({ events: [] } as any);

    vi.mocked(renderEventPage).mockImplementationOnce(() => {
      throw new Error('render fail');
    });

    const response = await onRequestGet({
      request,
      env: { ...baseEnvValues, DB },
      data: { nonce: 'nonce' }
    } as any);

    expect(response.status).toBe(500);
    await expect(response.text()).resolves.toBe('An error occurred');
    expect(renderEventPage).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith('event', expect.any(Error));
  });
});
