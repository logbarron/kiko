// ABOUTME: Tests JWT validation for admin route authentication.
// ABOUTME: Ensures Cloudflare Access tokens are properly verified with signature, claims, and timing checks.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requireAccessAssertion } from '../../../src/lib/access';
import type { Env } from '../../../src/types';

// Mock the access-jwks module
vi.mock('../../../src/lib/access-jwks', () => ({
  getSigningKey: vi.fn()
}));

const { getSigningKey } = await import('../../../src/lib/access-jwks');

// Helper to create a base64url encoded string
function base64urlEncode(input: string): string {
  const base64 = typeof btoa === 'function'
    ? btoa(input)
    : Buffer.from(input).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// Helper to create a mock JWT token
function createMockJwt(
  header: Record<string, unknown>,
  payload: Record<string, unknown>
): string {
  const headerB64 = base64urlEncode(JSON.stringify(header));
  const payloadB64 = base64urlEncode(JSON.stringify(payload));
  const signatureB64 = base64urlEncode('mock-signature');
  return `${headerB64}.${payloadB64}.${signatureB64}`;
}

// Helper to create a mock request with JWT header
function createMockRequest(jwt: string | null): {
  headers: { get(name: string): string | null };
} {
  return {
    headers: {
      get: (name: string) => {
        if (name === 'CF-Access-Jwt-Assertion') {
          return jwt;
        }
        return null;
      }
    }
  };
}

// Helper to create a mock env
function createMockEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: {} as any,
    KEK_B64: 'test-key',
    SESSION_IDLE_MIN: '30',
    SESSION_ABSOLUTE_HOURS: '12',
    MAGIC_LINK_TTL_MIN: '10',
    TURNSTILE_SITE_KEY: 'test',
    TURNSTILE_SECRET_KEY: 'test',
    GMAIL_CLIENT_ID: 'test',
    GMAIL_CLIENT_SECRET: 'test',
    GMAIL_REFRESH_TOKEN: 'test',
    GMAIL_FROM: 'test@example.com',
    APP_BASE_URL: 'https://example.com',
    STRIPE_SECRET_KEY: 'test',
    STRIPE_PUBLISHABLE_KEY: 'test',
    STRIPE_WEBHOOK_SECRET: 'test',
    INVITES_PER_EMAIL_PER_HOUR: '3',
    INVITES_PER_IP_PER_10MIN: '5',
    VERIFY_PER_IP_PER_10MIN: '15',
    ACCESS_AUD: 'test-audience',
    ACCESS_JWT_ISS: 'https://test.cloudflareaccess.com',
    ...overrides
  };
}

describe('requireAccessAssertion', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-04-01T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('bypasses validation in dev mode', async () => {
    const env = createMockEnv({ DEV_MODE: 'true' });
    const request = createMockRequest(null);

    const result = await requireAccessAssertion(request, env);

    expect(result).toEqual({ email: 'dev@localhost', sub: 'dev-mode' });
  });

  it('returns 503 when ACCESS_AUD is not configured', async () => {
    const env = createMockEnv({ ACCESS_AUD: undefined });
    const request = createMockRequest('some-jwt');

    const result = await requireAccessAssertion(request, env);

    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(503);
      expect(await result.text()).toBe('Access not configured');
    }
  });

  it('returns 503 when ACCESS_JWT_ISS is not configured', async () => {
    const env = createMockEnv({ ACCESS_JWT_ISS: undefined });
    const request = createMockRequest('some-jwt');

    const result = await requireAccessAssertion(request, env);

    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(503);
      expect(await result.text()).toBe('Access not configured');
    }
  });

  it('returns 401 when CF-Access-Jwt-Assertion header is missing', async () => {
    const env = createMockEnv();
    const request = createMockRequest(null);

    const result = await requireAccessAssertion(request, env);

    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(401);
      expect(await result.text()).toBe('Unauthorized');
    }
  });

  it('returns 401 when JWT has invalid structure (not 3 parts)', async () => {
    const env = createMockEnv();
    const request = createMockRequest('invalid.jwt');

    const result = await requireAccessAssertion(request, env);

    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(401);
      expect(await result.text()).toBe('Unauthorized');
    }
  });

  it('returns 401 when JWT algorithm is not RS256', async () => {
    const env = createMockEnv();
    const jwt = createMockJwt(
      { alg: 'HS256', kid: 'test-kid' },
      { aud: 'test-audience', iss: 'https://test.cloudflareaccess.com' }
    );
    const request = createMockRequest(jwt);

    const result = await requireAccessAssertion(request, env);

    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(401);
    }
  });

  it('returns 401 when JWT header is missing kid', async () => {
    const env = createMockEnv();
    const jwt = createMockJwt(
      { alg: 'RS256' },
      { aud: 'test-audience', iss: 'https://test.cloudflareaccess.com' }
    );
    const request = createMockRequest(jwt);

    const result = await requireAccessAssertion(request, env);

    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(401);
    }
  });

  it('returns 401 when signing key is not found', async () => {
    const env = createMockEnv();
    const jwt = createMockJwt(
      { alg: 'RS256', kid: 'unknown-kid' },
      { aud: 'test-audience', iss: 'https://test.cloudflareaccess.com' }
    );
    const request = createMockRequest(jwt);

    vi.mocked(getSigningKey).mockResolvedValue(null);

    const result = await requireAccessAssertion(request, env);

    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(401);
    }
    expect(getSigningKey).toHaveBeenCalledWith(env, 'unknown-kid');
  });

  it('returns 401 when JWT signature is invalid', async () => {
    const env = createMockEnv();
    const now = Math.floor(Date.now() / 1000);
    const jwt = createMockJwt(
      { alg: 'RS256', kid: 'test-kid' },
      {
        aud: 'test-audience',
        iss: 'https://test.cloudflareaccess.com',
        exp: now + 3600,
        email: 'user@example.com',
        sub: 'user-123'
      }
    );
    const request = createMockRequest(jwt);

    const mockKey = {} as CryptoKey;
    vi.mocked(getSigningKey).mockResolvedValue(mockKey);

    // Mock crypto.subtle.verify to return false (invalid signature)
    const originalVerify = crypto.subtle.verify;
    crypto.subtle.verify = vi.fn().mockResolvedValue(false);

    const result = await requireAccessAssertion(request, env);

    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(401);
    }

    crypto.subtle.verify = originalVerify;
  });

  it('returns 401 when JWT is expired', async () => {
    const env = createMockEnv();
    const now = Math.floor(Date.now() / 1000);
    const jwt = createMockJwt(
      { alg: 'RS256', kid: 'test-kid' },
      {
        aud: 'test-audience',
        iss: 'https://test.cloudflareaccess.com',
        exp: now - 1, // Expired 1 second ago
        email: 'user@example.com',
        sub: 'user-123'
      }
    );
    const request = createMockRequest(jwt);

    const mockKey = {} as CryptoKey;
    vi.mocked(getSigningKey).mockResolvedValue(mockKey);

    const originalVerify = crypto.subtle.verify;
    crypto.subtle.verify = vi.fn().mockResolvedValue(true);

    const result = await requireAccessAssertion(request, env);

    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(401);
    }

    crypto.subtle.verify = originalVerify;
  });

  it('returns 401 when JWT is not yet valid (nbf in future)', async () => {
    const env = createMockEnv();
    const now = Math.floor(Date.now() / 1000);
    const jwt = createMockJwt(
      { alg: 'RS256', kid: 'test-kid' },
      {
        aud: 'test-audience',
        iss: 'https://test.cloudflareaccess.com',
        exp: now + 3600,
        nbf: now + 60, // Not valid for another 60 seconds
        email: 'user@example.com',
        sub: 'user-123'
      }
    );
    const request = createMockRequest(jwt);

    const mockKey = {} as CryptoKey;
    vi.mocked(getSigningKey).mockResolvedValue(mockKey);

    const originalVerify = crypto.subtle.verify;
    crypto.subtle.verify = vi.fn().mockResolvedValue(true);

    const result = await requireAccessAssertion(request, env);

    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(401);
    }

    crypto.subtle.verify = originalVerify;
  });

  it('returns 401 when JWT audience does not match', async () => {
    const env = createMockEnv();
    const now = Math.floor(Date.now() / 1000);
    const jwt = createMockJwt(
      { alg: 'RS256', kid: 'test-kid' },
      {
        aud: 'wrong-audience',
        iss: 'https://test.cloudflareaccess.com',
        exp: now + 3600,
        email: 'user@example.com',
        sub: 'user-123'
      }
    );
    const request = createMockRequest(jwt);

    const mockKey = {} as CryptoKey;
    vi.mocked(getSigningKey).mockResolvedValue(mockKey);

    const originalVerify = crypto.subtle.verify;
    crypto.subtle.verify = vi.fn().mockResolvedValue(true);

    const result = await requireAccessAssertion(request, env);

    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(401);
    }

    crypto.subtle.verify = originalVerify;
  });

  it('returns 401 when JWT issuer does not match', async () => {
    const env = createMockEnv();
    const now = Math.floor(Date.now() / 1000);
    const jwt = createMockJwt(
      { alg: 'RS256', kid: 'test-kid' },
      {
        aud: 'test-audience',
        iss: 'https://wrong-issuer.com',
        exp: now + 3600,
        email: 'user@example.com',
        sub: 'user-123'
      }
    );
    const request = createMockRequest(jwt);

    const mockKey = {} as CryptoKey;
    vi.mocked(getSigningKey).mockResolvedValue(mockKey);

    const originalVerify = crypto.subtle.verify;
    crypto.subtle.verify = vi.fn().mockResolvedValue(true);

    const result = await requireAccessAssertion(request, env);

    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(401);
    }

    crypto.subtle.verify = originalVerify;
  });

  it('accepts JWT with audience as array', async () => {
    const env = createMockEnv();
    const now = Math.floor(Date.now() / 1000);
    const jwt = createMockJwt(
      { alg: 'RS256', kid: 'test-kid' },
      {
        aud: ['test-audience', 'other-audience'],
        iss: 'https://test.cloudflareaccess.com',
        exp: now + 3600,
        email: 'user@example.com',
        sub: 'user-123'
      }
    );
    const request = createMockRequest(jwt);

    const mockKey = {} as CryptoKey;
    vi.mocked(getSigningKey).mockResolvedValue(mockKey);

    const originalVerify = crypto.subtle.verify;
    crypto.subtle.verify = vi.fn().mockResolvedValue(true);

    const result = await requireAccessAssertion(request, env);

    expect(result).toEqual({ email: 'user@example.com', sub: 'user-123' });

    crypto.subtle.verify = originalVerify;
  });

  it('returns user claims when JWT is valid', async () => {
    const env = createMockEnv();
    const now = Math.floor(Date.now() / 1000);
    const jwt = createMockJwt(
      { alg: 'RS256', kid: 'test-kid' },
      {
        aud: 'test-audience',
        iss: 'https://test.cloudflareaccess.com',
        exp: now + 3600,
        email: 'admin@example.com',
        sub: 'admin-456'
      }
    );
    const request = createMockRequest(jwt);

    const mockKey = {} as CryptoKey;
    vi.mocked(getSigningKey).mockResolvedValue(mockKey);

    const originalVerify = crypto.subtle.verify;
    crypto.subtle.verify = vi.fn().mockResolvedValue(true);

    const result = await requireAccessAssertion(request, env);

    expect(result).toEqual({ email: 'admin@example.com', sub: 'admin-456' });
    expect(getSigningKey).toHaveBeenCalledWith(env, 'test-kid');

    crypto.subtle.verify = originalVerify;
  });

  it('handles JWT with missing optional email and sub claims', async () => {
    const env = createMockEnv();
    const now = Math.floor(Date.now() / 1000);
    const jwt = createMockJwt(
      { alg: 'RS256', kid: 'test-kid' },
      {
        aud: 'test-audience',
        iss: 'https://test.cloudflareaccess.com',
        exp: now + 3600
      }
    );
    const request = createMockRequest(jwt);

    const mockKey = {} as CryptoKey;
    vi.mocked(getSigningKey).mockResolvedValue(mockKey);

    const originalVerify = crypto.subtle.verify;
    crypto.subtle.verify = vi.fn().mockResolvedValue(true);

    const result = await requireAccessAssertion(request, env);

    expect(result).toEqual({ email: undefined, sub: undefined });

    crypto.subtle.verify = originalVerify;
  });

  it('returns 401 when JWT parsing throws an error', async () => {
    const env = createMockEnv();
    // Create a JWT with invalid base64 encoding
    const request = createMockRequest('eyJ.invalid-base64!@#.xyz');

    const result = await requireAccessAssertion(request, env);

    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(401);
    }
  });

  it('verifies JWT signature with correct signed data', async () => {
    const env = createMockEnv();
    const now = Math.floor(Date.now() / 1000);

    const header = { alg: 'RS256', kid: 'test-kid' };
    const payload = {
      aud: 'test-audience',
      iss: 'https://test.cloudflareaccess.com',
      exp: now + 3600,
      email: 'user@example.com'
    };

    const jwt = createMockJwt(header, payload);
    const request = createMockRequest(jwt);

    const mockKey = {} as CryptoKey;
    vi.mocked(getSigningKey).mockResolvedValue(mockKey);

    const verifySpy = vi.fn().mockResolvedValue(true);
    const originalVerify = crypto.subtle.verify;
    crypto.subtle.verify = verifySpy;

    await requireAccessAssertion(request, env);

    // Verify that crypto.subtle.verify was called with the correct algorithm and key
    expect(verifySpy).toHaveBeenCalledWith(
      'RSASSA-PKCS1-v1_5',
      mockKey,
      expect.any(ArrayBuffer),
      expect.any(ArrayBuffer)
    );

    crypto.subtle.verify = originalVerify;
  });
});
