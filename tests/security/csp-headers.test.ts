// ABOUTME: Verifies CSP (Content Security Policy) headers are set correctly.
// ABOUTME: Ensures nonce-based CSP prevents inline script execution and XSS.

import { describe, expect, it, vi, afterEach } from 'vitest';
import { onRequest } from '../../functions/_middleware';

describe('CSP header middleware', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('generates and injects CSP nonce into response headers', async () => {
    const mockNext = vi.fn(async () => {
      return new Response('ok', {
        headers: {
          'Content-Security-Policy': "script-src 'nonce-{NONCE}'"
        }
      });
    });

    const response = await onRequest({
      request: new Request('https://example.com/test'),
      env: {} as any,
      data: {},
      next: mockNext
    } as any);

    const csp = response.headers.get('Content-Security-Policy');

    // Verify nonce placeholder was replaced
    expect(csp).not.toContain('{NONCE}');

    // Verify nonce format
    expect(csp).toMatch(/script-src 'nonce-[A-Za-z0-9+/=]+'/);
  });

  it('replaces multiple nonce placeholders', async () => {
    const mockNext = vi.fn(async () => {
      return new Response('ok', {
        headers: {
          'Content-Security-Policy': "script-src 'nonce-{NONCE}'; style-src 'nonce-{NONCE}'"
        }
      });
    });

    const response = await onRequest({
      request: new Request('https://example.com/test'),
      env: {} as any,
      data: {},
      next: mockNext
    } as any);

    const csp = response.headers.get('Content-Security-Policy');

    // Verify all placeholders were replaced
    expect(csp).not.toContain('{NONCE}');

    // Verify both directives have nonces
    expect(csp).toContain("script-src 'nonce-");
    expect(csp).toContain("style-src 'nonce-");
  });

  it('applies default CSP when handler does not set one', async () => {
    const mockNext = vi.fn(async () => {
      return new Response('ok');
    });

    const response = await onRequest({
      request: new Request('https://example.com/test'),
      env: {} as any,
      data: {},
      next: mockNext
    } as any);

    const csp = response.headers.get('Content-Security-Policy');

    // Should have a default CSP
    expect(csp).toBeTruthy();

    // Should not contain placeholder
    expect(csp).not.toContain('{NONCE}');

    // Should have key directives
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'self' 'nonce-");
  });

  it('sets security headers if not already present', async () => {
    const mockNext = vi.fn(async () => new Response('ok'));

    const response = await onRequest({
      request: new Request('https://example.com/test'),
      env: {} as any,
      data: {},
      next: mockNext
    } as any);

    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
  });

  it('does not override existing security headers', async () => {
    const mockNext = vi.fn(async () => {
      return new Response('ok', {
        headers: {
          'X-Content-Type-Options': 'custom-value',
          'X-Frame-Options': 'SAMEORIGIN',
          'Referrer-Policy': 'same-origin'
        }
      });
    });

    const response = await onRequest({
      request: new Request('https://example.com/test'),
      env: {} as any,
      data: {},
      next: mockNext
    } as any);

    // Should preserve existing values
    expect(response.headers.get('X-Content-Type-Options')).toBe('custom-value');
    expect(response.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
    expect(response.headers.get('Referrer-Policy')).toBe('same-origin');
  });

  it('sets Cache-Control no-store for /event route', async () => {
    const mockNext = vi.fn(async () => new Response('ok'));

    const response = await onRequest({
      request: new Request('https://example.com/event'),
      env: {} as any,
      data: {},
      next: mockNext
    } as any);

    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });

  it('sets Cache-Control no-store for /admin routes', async () => {
    const mockNext = vi.fn(async () => new Response('ok'));

    const response = await onRequest({
      request: new Request('https://example.com/admin/guests'),
      env: {} as any,
      data: {},
      next: mockNext
    } as any);

    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });

  it('sets Cache-Control no-store for /auth/verify route', async () => {
    const mockNext = vi.fn(async () => new Response('ok'));

    const response = await onRequest({
      request: new Request('https://example.com/auth/verify?token=abc'),
      env: {} as any,
      data: {},
      next: mockNext
    } as any);

    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });

  it('does not set Cache-Control no-store for public routes', async () => {
    const mockNext = vi.fn(async () => new Response('ok'));

    const response = await onRequest({
      request: new Request('https://example.com/invite'),
      env: {} as any,
      data: {},
      next: mockNext
    } as any);

    // Should not have no-store for public route
    expect(response.headers.get('Cache-Control')).not.toBe('no-store');
  });

  it('provides nonce in context data for use by handlers', async () => {
    const context: any = {
      request: new Request('https://example.com/test'),
      env: {},
      data: {},
      next: vi.fn(async () => new Response('ok'))
    };

    await onRequest(context);

    // Nonce should be stored in context data
    expect(context.data.nonce).toBeTruthy();
    expect(typeof context.data.nonce).toBe('string');
    expect(context.data.nonce.length).toBeGreaterThan(10);
  });

  it('ensures HTML uses the same nonce as the CSP header', async () => {
    const context: any = {
      request: new Request('https://example.com/test'),
      env: {},
      data: {},
      next: vi.fn(async () => {
        const nonce = context.data.nonce;
        return new Response(`<script nonce="${nonce}">console.log('ok');</script>`, {
          headers: {
            'Content-Security-Policy': "script-src 'nonce-{NONCE}'"
          }
        });
      })
    };

    const response = await onRequest(context);
    const csp = response.headers.get('Content-Security-Policy') ?? '';
    const html = await response.text();

    const match = csp.match(/'nonce-([^']+)'/);
    expect(match).toBeTruthy();
    expect(match?.[1]).toBe(context.data.nonce);
    expect(html).toContain(`nonce="${context.data.nonce}"`);
  });

  it('shares the generated nonce with downstream handler responses', async () => {
    let seenNonce: string | undefined;

    const context: any = {
      request: new Request('https://example.com/test'),
      env: {},
      data: { keep: 'value' },
      next: vi.fn(async () => {
        seenNonce = context.data.nonce;
        expect(seenNonce).toBeTruthy();
        expect(context.data.keep).toBe('value');
        return new Response('ok', {
          headers: {
            'Content-Security-Policy': "script-src 'nonce-{NONCE}'; style-src 'nonce-{NONCE}'"
          }
        });
      })
    };

    const response = await onRequest(context);

    expect(seenNonce).toBeTruthy();
    const csp = response.headers.get('Content-Security-Policy');
    const nonceMatch = csp?.match(/nonce-([A-Za-z0-9+/=]+)/);
    expect(nonceMatch?.[1]).toBe(seenNonce);
    expect(context.data.keep).toBe('value');
  });

  it('generates different nonces for each request', async () => {
    const nonces = new Set<string>();

    for (let i = 0; i < 100; i++) {
      const mockNext = vi.fn(async () => {
        return new Response('ok', {
          headers: {
            'Content-Security-Policy': "script-src 'nonce-{NONCE}'"
          }
        });
      });

      const response = await onRequest({
        request: new Request('https://example.com/test'),
        env: {} as any,
        data: {},
        next: mockNext
      } as any);

      const csp = response.headers.get('Content-Security-Policy');
      const nonceMatch = csp?.match(/nonce-([A-Za-z0-9+/=]+)/);

      if (nonceMatch) {
        nonces.add(nonceMatch[1]);
      }
    }

    // All 100 nonces should be unique
    expect(nonces.size).toBe(100);
  });

  it('propagates downstream errors without masking them', async () => {
    const failure = new Error('middleware-next-failure');
    const context: any = {
      request: new Request('https://example.com/test'),
      env: {},
      data: {},
      next: vi.fn(async () => {
        throw failure;
      })
    };

    await expect(onRequest(context)).rejects.toBe(failure);
    expect(context.data?.nonce).toBeTruthy();
    expect(context.next).toHaveBeenCalledTimes(1);
  });
});

describe('CSP policy directives', () => {
  it('default CSP blocks unsafe-inline scripts', async () => {
    const mockNext = vi.fn(async () => new Response('ok'));

    const response = await onRequest({
      request: new Request('https://example.com/test'),
      env: {} as any,
      data: {},
      next: mockNext
    } as any);

    const csp = response.headers.get('Content-Security-Policy');

    // Should not allow unsafe-inline
    expect(csp).not.toContain("'unsafe-inline'");

    // Should only allow nonce-based scripts
    expect(csp).toContain("script-src 'self' 'nonce-");
  });

  it('default CSP allows Turnstile domains', async () => {
    const mockNext = vi.fn(async () => new Response('ok'));

    const response = await onRequest({
      request: new Request('https://example.com/test'),
      env: {} as any,
      data: {},
      next: mockNext
    } as any);

    const csp = response.headers.get('Content-Security-Policy');

    // Should allow Turnstile
    expect(csp).toContain('challenges.cloudflare.com');
  });

  it('default CSP sets restrictive default-src', async () => {
    const mockNext = vi.fn(async () => new Response('ok'));

    const response = await onRequest({
      request: new Request('https://example.com/test'),
      env: {} as any,
      data: {},
      next: mockNext
    } as any);

    const csp = response.headers.get('Content-Security-Policy');

    // Should have restrictive default
    expect(csp).toContain("default-src 'none'");
  });

  it('default CSP denies framing', async () => {
    const mockNext = vi.fn(async () => new Response('ok'));

    const response = await onRequest({
      request: new Request('https://example.com/test'),
      env: {} as any,
      data: {},
      next: mockNext
    } as any);

    const csp = response.headers.get('Content-Security-Policy');

    // Should deny framing
    expect(csp).toContain("frame-ancestors 'none'");
  });
});
