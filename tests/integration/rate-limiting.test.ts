// ABOUTME: Tests invite rate limiting using in-memory KV storage.
// ABOUTME: Ensures IP/email throttles trigger without mocking checkRateLimit.

import { describe, expect, it, vi } from 'vitest';
import { createMockD1 } from '../helpers/mock-d1';
import { createInMemoryKv } from '../helpers/in-memory-kv';

const TEST_KEK_B64 = Buffer.from('0123456789abcdef0123456789abcdef').toString('base64');

describe('invite handler rate limiting', () => {
  it('throttles repeated requests by IP and email', async () => {
    vi.resetModules();

    const sendMagicLinkEmail = vi.fn(async () => undefined);

    vi.doMock('../../src/lib/turnstile', () => ({
      verifyTurnstile: vi.fn(async () => true)
    }));

    vi.doMock('../../src/lib/gmail', () => ({
      sendMagicLinkEmail
    }));

    const { onRequestPost } = await import('../../functions/invite');

    const ratelimitKv = createInMemoryKv(() => 1000);

    const { DB, calls } = createMockD1((query, method) => {
      if (method === 'first' && query.includes('FROM guests WHERE email_hash')) {
        return { id: 42, invite_clicked_at: null };
      }
      if (method === 'run' && query.includes('UPDATE guests SET registered_at')) {
        return { success: true };
      }
      if (method === 'run' && query.includes('INSERT INTO magic_links')) {
        return { success: true };
      }
      if (method === 'run' && query.includes('INSERT INTO audit_events')) {
        return { success: true };
      }
      if (method === 'first' && query.includes('FROM event WHERE id = 1')) {
        return null;
      }
      return { results: [] };
    });

    const env = {
      DB,
      KEK_B64: TEST_KEK_B64,
      APP_BASE_URL: 'https://app.example.com',
      TURNSTILE_SITE_KEY: 'site',
      TURNSTILE_SECRET_KEY: 'turnstile-secret',
      INVITES_PER_EMAIL_PER_HOUR: '2',
      INVITES_PER_IP_PER_10MIN: '3',
      MAGIC_LINK_TTL_MIN: '10',
      SESSION_IDLE_MIN: '30',
      SESSION_ABSOLUTE_HOURS: '24',
      RATE_LIMIT_KV: ratelimitKv
    } as any;

    const body = new URLSearchParams({
      email: 'guest@example.com',
      'cf-turnstile-response': 'token'
    }).toString();

    async function request(ip: string) {
      return onRequestPost({
        request: new Request('https://example.com/invite', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'CF-Connecting-IP': ip
          },
          body
        }),
        env,
        data: { nonce: 'nonce' }
      } as any);
    }

    // First three requests from same IP should succeed (limit is 3)
    const first = await request('198.51.100.10');
    const second = await request('198.51.100.10');
    const third = await request('198.51.100.10');

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(200);

    // Fourth request exceeds IP limit and should be throttled
    const fourth = await request('198.51.100.10');
    expect(fourth.status).toBe(429);
    const fourthHtml = await fourth.text();
    expect(fourthHtml).toContain('Too many requests');

    // Advance time beyond window, IP limit should reset
    ratelimitKv.advanceTime(600);
    const resetAttempt = await request('198.51.100.10');
    expect(resetAttempt.status).toBe(200);

    // Email limit (2 per hour) should apply even from different IPs
    const emailSecond = await request('203.0.113.5');
    expect(emailSecond.status).toBe(200);
    const emailThird = await request('203.0.113.6');
    expect(emailThird.status).toBe(200);
    const emailFourth = await request('203.0.113.7');
    expect(emailFourth.status).toBe(200);

    const emailLimitHit = await request('203.0.113.8');
    expect(emailLimitHit.status).toBe(200);
    const html = await emailLimitHit.text();
    expect(html).toContain('Perfect! Check your email now');
    expect(sendMagicLinkEmail).toHaveBeenCalled();
    const limitedCallCount = calls.filter(call => call.query.includes('INSERT INTO magic_links')).length;
    expect(limitedCallCount).toBeLessThanOrEqual(4);
  });
});
