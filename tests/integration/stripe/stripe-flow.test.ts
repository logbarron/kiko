// ABOUTME: Tests Stripe integration endpoints for honeymoon fund contributions.
// ABOUTME: Ensures session validation, rate limiting, amount validation, and guest ownership checks.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onRequestGet as configGet } from '../../../functions/stripe/config';
import { onRequestPost as createSessionPost } from '../../../functions/stripe/create-session';
import { onRequestGet as sessionStatusGet } from '../../../functions/stripe/session-status';
import { createMockD1 } from '../../helpers/mock-d1';
import type Stripe from 'stripe';

// Mock dependencies
vi.mock('../../../src/lib/cookies', () => ({
  validateSession: vi.fn()
}));

vi.mock('../../../src/lib/origin', () => ({
  isAllowedOrigin: vi.fn()
}));

vi.mock('../../../src/lib/ratelimit', () => ({
  checkRateLimit: vi.fn()
}));

vi.mock('../../../src/lib/logger', () => ({
  logError: vi.fn()
}));

vi.mock('../../../src/lib/stripe', () => ({
  createStripeClient: vi.fn()
}));

const { validateSession } = await import('../../../src/lib/cookies');
const { isAllowedOrigin } = await import('../../../src/lib/origin');
const { checkRateLimit } = await import('../../../src/lib/ratelimit');
const { createStripeClient } = await import('../../../src/lib/stripe');

function createMockEnv(DB: any, overrides: Record<string, string> = {}) {
  return {
    DB,
    KEK_B64: 'test-key',
    APP_BASE_URL: 'https://example.com',
    STRIPE_PUBLISHABLE_KEY: 'pk_test_123',
    STRIPE_SECRET_KEY: 'sk_test_123',
    SESSION_IDLE_MIN: '30',
    SESSION_ABSOLUTE_HOURS: '12',
    ...overrides
  } as any;
}

function createMockStripeClient() {
  return {
    checkout: {
      sessions: {
        create: vi.fn(),
        retrieve: vi.fn()
      }
    }
  } as unknown as Stripe;
}

describe('GET /stripe/config', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-04-01T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns publishable key when session is valid and origin allowed', async () => {
    const { DB } = createMockD1(() => undefined);
    const env = createMockEnv(DB);

    vi.mocked(isAllowedOrigin).mockReturnValue(true);
    vi.mocked(validateSession).mockResolvedValue({
      id: 1,
      guest_id: 42,
      session_id_hash: 'hash',
      created_at: Date.now(),
      expires_at: Date.now() + 3600,
      last_seen_at: Date.now()
    } as any);

    const request = new Request('https://example.com/stripe/config', {
      headers: { Cookie: '__Host-s=session-token' }
    });

    const response = await configGet({ request, env } as any);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ publishableKey: 'pk_test_123' });
    expect(isAllowedOrigin).toHaveBeenCalledWith(request, 'https://example.com');
    expect(validateSession).toHaveBeenCalledWith('__Host-s=session-token', env);
  });

  it('returns 401 when origin is not allowed', async () => {
    const { DB } = createMockD1(() => undefined);
    const env = createMockEnv(DB);

    vi.mocked(isAllowedOrigin).mockReturnValue(false);

    const request = new Request('https://evil.com/stripe/config', {
      headers: { Cookie: '__Host-s=token' }
    });

    const response = await configGet({ request, env } as any);

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data).toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 when cookie header is missing', async () => {
    const { DB } = createMockD1(() => undefined);
    const env = createMockEnv(DB);

    vi.mocked(isAllowedOrigin).mockReturnValue(true);

    const request = new Request('https://example.com/stripe/config');

    const response = await configGet({ request, env } as any);

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toContain('Session expired');
  });

  it('returns 401 when session is invalid', async () => {
    const { DB } = createMockD1(() => undefined);
    const env = createMockEnv(DB);

    vi.mocked(isAllowedOrigin).mockReturnValue(true);
    vi.mocked(validateSession).mockResolvedValue(null);

    const request = new Request('https://example.com/stripe/config', {
      headers: { Cookie: '__Host-s=invalid-token' }
    });

    const response = await configGet({ request, env } as any);

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toContain('Session expired');
  });

  it('returns 500 when STRIPE_PUBLISHABLE_KEY is not configured', async () => {
    const { DB } = createMockD1(() => undefined);
    const env = createMockEnv(DB, { STRIPE_PUBLISHABLE_KEY: '' });

    vi.mocked(isAllowedOrigin).mockReturnValue(true);
    vi.mocked(validateSession).mockResolvedValue({
      id: 1,
      guest_id: 42,
      session_id_hash: 'hash',
      created_at: Date.now(),
      expires_at: Date.now() + 3600,
      last_seen_at: Date.now()
    } as any);

    const request = new Request('https://example.com/stripe/config', {
      headers: { Cookie: '__Host-s=token' }
    });

    const response = await configGet({ request, env } as any);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toContain('not configured');
  });
});

describe('POST /stripe/create-session', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-04-01T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('creates checkout session with valid amount', async () => {
    const { DB } = createMockD1(() => undefined);
    const env = createMockEnv(DB);

    const mockStripe = createMockStripeClient();
    vi.mocked(createStripeClient).mockReturnValue(mockStripe);

    const mockCheckoutSession = {
      id: 'cs_test_123',
      client_secret: 'cs_test_123_secret_abc',
      status: 'open',
      metadata: { guest_id: '42', contribution_dollars: '50.00' }
    };
    vi.mocked(mockStripe.checkout.sessions.create).mockResolvedValue(mockCheckoutSession as any);

    vi.mocked(isAllowedOrigin).mockReturnValue(true);
    vi.mocked(validateSession).mockResolvedValue({
      id: 1,
      guest_id: 42,
      session_id_hash: 'hash',
      created_at: Date.now(),
      expires_at: Date.now() + 3600,
      last_seen_at: Date.now()
    } as any);
    vi.mocked(checkRateLimit).mockResolvedValue(true);

    const request = new Request('https://example.com/stripe/create-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: '__Host-s=token'
      },
      body: JSON.stringify({ amountUsd: 50 })
    });

    const response = await createSessionPost({ request, env } as any);

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data).toEqual({
      clientSecret: 'cs_test_123_secret_abc',
      sessionId: 'cs_test_123'
    });

    expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'payment',
        ui_mode: 'custom',
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            unit_amount: 5000,
            product_data: {
              name: 'Honeymoon Fund Contribution'
            }
          },
          quantity: 1
        }],
        metadata: {
          app: '<TODO_your_project_name>',
          contribution_dollars: '50.00',
          guest_id: '42'
        },
        return_url: 'https://example.com/event?session_id={CHECKOUT_SESSION_ID}'
      }),
      expect.objectContaining({
        idempotencyKey: expect.any(String)
      })
    );
  });

  it('enforces rate limiting', async () => {
    const { DB } = createMockD1(() => undefined);
    const env = createMockEnv(DB);

    vi.mocked(isAllowedOrigin).mockReturnValue(true);
    vi.mocked(validateSession).mockResolvedValue({
      id: 1,
      guest_id: 42,
      session_id_hash: 'hash',
      created_at: Date.now(),
      expires_at: Date.now() + 3600,
      last_seen_at: Date.now()
    } as any);
    vi.mocked(checkRateLimit).mockResolvedValue(false);

    const request = new Request('https://example.com/stripe/create-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: '__Host-s=token'
      },
      body: JSON.stringify({ amountUsd: 25 })
    });

    const response = await createSessionPost({ request, env } as any);

    expect(response.status).toBe(429);
    const data = await response.json();
    expect(data.error).toContain('Too many requests');
    expect(checkRateLimit).toHaveBeenCalledWith(env, 'stripe:create:42', 10, 3600);
  });

  it('validates minimum amount ($1)', async () => {
    const { DB } = createMockD1(() => undefined);
    const env = createMockEnv(DB);

    vi.mocked(isAllowedOrigin).mockReturnValue(true);
    vi.mocked(validateSession).mockResolvedValue({
      id: 1,
      guest_id: 42,
      session_id_hash: 'hash',
      created_at: Date.now(),
      expires_at: Date.now() + 3600,
      last_seen_at: Date.now()
    } as any);
    vi.mocked(checkRateLimit).mockResolvedValue(true);

    const request = new Request('https://example.com/stripe/create-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: '__Host-s=token'
      },
      body: JSON.stringify({ amountUsd: 0.5 })
    });

    const response = await createSessionPost({ request, env } as any);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Minimum contribution is $1');
  });

  it('rejects invalid amount format', async () => {
    const { DB } = createMockD1(() => undefined);
    const env = createMockEnv(DB);

    vi.mocked(isAllowedOrigin).mockReturnValue(true);
    vi.mocked(validateSession).mockResolvedValue({
      id: 1,
      guest_id: 42,
      session_id_hash: 'hash',
      created_at: Date.now(),
      expires_at: Date.now() + 3600,
      last_seen_at: Date.now()
    } as any);
    vi.mocked(checkRateLimit).mockResolvedValue(true);

    const request = new Request('https://example.com/stripe/create-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: '__Host-s=token'
      },
      body: JSON.stringify({ amountUsd: 'invalid' })
    });

    const response = await createSessionPost({ request, env } as any);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('valid amount');
  });

  it('rejects malformed JSON payload', async () => {
    const { DB } = createMockD1(() => undefined);
    const env = createMockEnv(DB);

    vi.mocked(isAllowedOrigin).mockReturnValue(true);
    vi.mocked(validateSession).mockResolvedValue({
      id: 1,
      guest_id: 42,
      session_id_hash: 'hash',
      created_at: Date.now(),
      expires_at: Date.now() + 3600,
      last_seen_at: Date.now()
    } as any);
    vi.mocked(checkRateLimit).mockResolvedValue(true);

    const request = new Request('https://example.com/stripe/create-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: '__Host-s=token'
      },
      body: 'not-json'
    });

    const response = await createSessionPost({ request, env } as any);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Invalid request payload');
  });

  it('accepts string amount and converts to number', async () => {
    const { DB } = createMockD1(() => undefined);
    const env = createMockEnv(DB);

    const mockStripe = createMockStripeClient();
    vi.mocked(createStripeClient).mockReturnValue(mockStripe);

    const mockCheckoutSession = {
      id: 'cs_test_456',
      client_secret: 'cs_test_456_secret',
      status: 'open'
    };
    vi.mocked(mockStripe.checkout.sessions.create).mockResolvedValue(mockCheckoutSession as any);

    vi.mocked(isAllowedOrigin).mockReturnValue(true);
    vi.mocked(validateSession).mockResolvedValue({
      id: 1,
      guest_id: 42,
      session_id_hash: 'hash',
      created_at: Date.now(),
      expires_at: Date.now() + 3600,
      last_seen_at: Date.now()
    } as any);
    vi.mocked(checkRateLimit).mockResolvedValue(true);

    const request = new Request('https://example.com/stripe/create-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: '__Host-s=token'
      },
      body: JSON.stringify({ amountUsd: '100.50' })
    });

    const response = await createSessionPost({ request, env } as any);

    expect(response.status).toBe(201);
    expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [{
          price_data: {
            currency: 'usd',
            unit_amount: 10050,
            product_data: {
              name: 'Honeymoon Fund Contribution'
            }
          },
          quantity: 1
        }]
      }),
      expect.any(Object)
    );
  });

  it('returns 500 when Stripe client creation fails', async () => {
    const { DB } = createMockD1(() => undefined);
    const env = createMockEnv(DB);

    vi.mocked(isAllowedOrigin).mockReturnValue(true);
    vi.mocked(validateSession).mockResolvedValue({
      id: 1,
      guest_id: 42,
      session_id_hash: 'hash',
      created_at: Date.now(),
      expires_at: Date.now() + 3600,
      last_seen_at: Date.now()
    } as any);
    vi.mocked(checkRateLimit).mockResolvedValue(true);
    vi.mocked(createStripeClient).mockImplementation(() => {
      throw new Error('Invalid API key');
    });

    const request = new Request('https://example.com/stripe/create-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: '__Host-s=token'
      },
      body: JSON.stringify({ amountUsd: 10 })
    });

    const response = await createSessionPost({ request, env } as any);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toContain('not available');
  });
});

describe('GET /stripe/session-status', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-04-01T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns session status when guest owns the session', async () => {
    const { DB } = createMockD1(() => undefined);
    const env = createMockEnv(DB);

    const mockStripe = createMockStripeClient();
    vi.mocked(createStripeClient).mockReturnValue(mockStripe);

    const mockCheckoutSession = {
      id: 'cs_test_789',
      status: 'complete',
      amount_total: 5000,
      currency: 'usd',
      metadata: { guest_id: '42', app: '<TODO_your_project_name>' },
      customer_details: { email: 'guest@example.com' },
      payment_intent: {
        latest_charge: {
          receipt_url: 'https://stripe.com/receipt/123'
        }
      }
    };
    vi.mocked(mockStripe.checkout.sessions.retrieve).mockResolvedValue(mockCheckoutSession as any);

    vi.mocked(isAllowedOrigin).mockReturnValue(true);
    vi.mocked(validateSession).mockResolvedValue({
      id: 1,
      guest_id: 42,
      session_id_hash: 'hash',
      created_at: Date.now(),
      expires_at: Date.now() + 3600,
      last_seen_at: Date.now()
    } as any);
    vi.mocked(checkRateLimit).mockResolvedValue(true);

    const request = new Request('https://example.com/stripe/session-status?session_id=cs_test_789', {
      headers: { Cookie: '__Host-s=token' }
    });

    const response = await sessionStatusGet({ request, env } as any);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({
      status: 'complete',
      amountTotal: 5000,
      currency: 'usd',
      receiptUrl: 'https://stripe.com/receipt/123',
      email: 'guest@example.com'
    });

    expect(mockStripe.checkout.sessions.retrieve).toHaveBeenCalledWith(
      'cs_test_789',
      { expand: ['payment_intent.latest_charge'] }
    );
  });

  it('returns 404 when guest does not own the session', async () => {
    const { DB } = createMockD1(() => undefined);
    const env = createMockEnv(DB);

    const mockStripe = createMockStripeClient();
    vi.mocked(createStripeClient).mockReturnValue(mockStripe);

    const mockCheckoutSession = {
      id: 'cs_test_999',
      metadata: { guest_id: '99' }
    };
    vi.mocked(mockStripe.checkout.sessions.retrieve).mockResolvedValue(mockCheckoutSession as any);

    vi.mocked(isAllowedOrigin).mockReturnValue(true);
    vi.mocked(validateSession).mockResolvedValue({
      id: 1,
      guest_id: 42,
      session_id_hash: 'hash',
      created_at: Date.now(),
      expires_at: Date.now() + 3600,
      last_seen_at: Date.now()
    } as any);
    vi.mocked(checkRateLimit).mockResolvedValue(true);

    const request = new Request('https://example.com/stripe/session-status?session_id=cs_test_999', {
      headers: { Cookie: '__Host-s=token' }
    });

    const response = await sessionStatusGet({ request, env } as any);

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toContain('not found');
  });

  it('returns 400 when session_id parameter is missing', async () => {
    const { DB } = createMockD1(() => undefined);
    const env = createMockEnv(DB);

    vi.mocked(isAllowedOrigin).mockReturnValue(true);
    vi.mocked(validateSession).mockResolvedValue({
      id: 1,
      guest_id: 42,
      session_id_hash: 'hash',
      created_at: Date.now(),
      expires_at: Date.now() + 3600,
      last_seen_at: Date.now()
    } as any);
    vi.mocked(checkRateLimit).mockResolvedValue(true);

    const request = new Request('https://example.com/stripe/session-status', {
      headers: { Cookie: '__Host-s=token' }
    });

    const response = await sessionStatusGet({ request, env } as any);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Missing session_id parameter');
  });

  it('enforces rate limiting', async () => {
    const { DB } = createMockD1(() => undefined);
    const env = createMockEnv(DB);

    vi.mocked(isAllowedOrigin).mockReturnValue(true);
    vi.mocked(validateSession).mockResolvedValue({
      id: 1,
      guest_id: 42,
      session_id_hash: 'hash',
      created_at: Date.now(),
      expires_at: Date.now() + 3600,
      last_seen_at: Date.now()
    } as any);
    vi.mocked(checkRateLimit).mockResolvedValue(false);

    const request = new Request('https://example.com/stripe/session-status?session_id=cs_test_123', {
      headers: { Cookie: '__Host-s=token' }
    });

    const response = await sessionStatusGet({ request, env } as any);

    expect(response.status).toBe(429);
    const data = await response.json();
    expect(data.error).toContain('Too many requests');
    expect(checkRateLimit).toHaveBeenCalledWith(env, 'stripe:status:42', 30, 3600);
  });

  it('returns null receiptUrl when payment intent has no charge', async () => {
    const { DB } = createMockD1(() => undefined);
    const env = createMockEnv(DB);

    const mockStripe = createMockStripeClient();
    vi.mocked(createStripeClient).mockReturnValue(mockStripe);

    const mockCheckoutSession = {
      id: 'cs_test_pending',
      status: 'open',
      amount_total: 2500,
      currency: 'usd',
      metadata: { guest_id: '42' },
      customer_details: null,
      payment_intent: null
    };
    vi.mocked(mockStripe.checkout.sessions.retrieve).mockResolvedValue(mockCheckoutSession as any);

    vi.mocked(isAllowedOrigin).mockReturnValue(true);
    vi.mocked(validateSession).mockResolvedValue({
      id: 1,
      guest_id: 42,
      session_id_hash: 'hash',
      created_at: Date.now(),
      expires_at: Date.now() + 3600,
      last_seen_at: Date.now()
    } as any);
    vi.mocked(checkRateLimit).mockResolvedValue(true);

    const request = new Request('https://example.com/stripe/session-status?session_id=cs_test_pending', {
      headers: { Cookie: '__Host-s=token' }
    });

    const response = await sessionStatusGet({ request, env } as any);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.receiptUrl).toBeNull();
    expect(data.email).toBeNull();
    expect(data.status).toBe('open');
  });

  it('returns 404 when Stripe returns 404', async () => {
    const { DB } = createMockD1(() => undefined);
    const env = createMockEnv(DB);

    const mockStripe = createMockStripeClient();
    vi.mocked(createStripeClient).mockReturnValue(mockStripe);

    // Create a proper Stripe error by importing and using the actual Stripe library
    const StripeModule = await import('stripe');
    const StripeErrorClass = StripeModule.default.errors.StripeError;

    const stripeError = Object.create(StripeErrorClass.prototype);
    stripeError.message = 'Not found';
    stripeError.statusCode = 404;
    stripeError.type = 'invalid_request_error';

    vi.mocked(mockStripe.checkout.sessions.retrieve).mockRejectedValue(stripeError);

    vi.mocked(isAllowedOrigin).mockReturnValue(true);
    vi.mocked(validateSession).mockResolvedValue({
      id: 1,
      guest_id: 42,
      session_id_hash: 'hash',
      created_at: Date.now(),
      expires_at: Date.now() + 3600,
      last_seen_at: Date.now()
    } as any);
    vi.mocked(checkRateLimit).mockResolvedValue(true);

    const request = new Request('https://example.com/stripe/session-status?session_id=cs_nonexistent', {
      headers: { Cookie: '__Host-s=token' }
    });

    const response = await sessionStatusGet({ request, env } as any);

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toContain('not found');
  });
});
