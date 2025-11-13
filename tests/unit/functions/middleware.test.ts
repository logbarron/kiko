// ABOUTME: Validates middleware nonce and security headers.
// ABOUTME: Ensures CSP placeholders are populated and protected routes are no-store.

import { Buffer } from 'node:buffer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequest } from '../../../functions/_middleware';

function mockNonceBytes(value: number) {
  const spy = vi.spyOn(globalThis.crypto, 'getRandomValues');
  spy.mockImplementation((array: Uint8Array) => {
    array.fill(value);
    return array;
  });
  return spy;
}

describe('middleware onRequest', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('replaces CSP nonce placeholders and sets security headers', async () => {
    const nonceSpy = mockNonceBytes(0);
    const response = new Response('ok', {
      headers: {
        'Content-Security-Policy': "script-src 'nonce-{NONCE}'"
      }
    });

    const result = await onRequest({
      request: new Request('https://example.com/invite'),
      env: {} as any,
      data: {},
      next: vi.fn(async () => response)
    } as any);

    const expectedNonce = Buffer.from(new Uint8Array(16).fill(0)).toString('base64');
    expect(result.headers.get('Content-Security-Policy')).toBe(`script-src 'nonce-${expectedNonce}'`);
    expect(result.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(result.headers.get('X-Frame-Options')).toBe('DENY');
    expect(result.headers.get('Referrer-Policy')).toBe('no-referrer');
    nonceSpy.mockRestore();
  });

  it('stores generated nonce on context data without clobbering existing keys', async () => {
    mockNonceBytes(2);
    const context: any = {
      request: new Request('https://example.com/invite'),
      env: {},
      data: { existing: 'value' },
      next: vi.fn(async () => new Response('ok', {
        headers: {
          'Content-Security-Policy': "script-src 'nonce-{NONCE}'"
        }
      }))
    };

    const result = await onRequest(context);

    const expectedNonce = Buffer.from(new Uint8Array(16).fill(2)).toString('base64');
    expect(context.data.existing).toBe('value');
    expect(context.data.nonce).toBe(expectedNonce);
    expect(result.headers.get('Content-Security-Policy')).toContain(`nonce-${expectedNonce}`);
  });

  it('sets no-store headers for protected routes when absent', async () => {
    mockNonceBytes(1);
    const next = vi.fn(async () => new Response('ok'));

    const result = await onRequest({
      request: new Request('https://example.com/event'),
      env: {} as any,
      data: {},
      next
    } as any);

    expect(result.headers.get('Cache-Control')).toBe('no-store');
    expect(result.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    expect(next).toHaveBeenCalledOnce();
  });

  it('preserves existing cache headers on public routes', async () => {
    mockNonceBytes(3);
    const next = vi.fn(async () => new Response('ok', {
      headers: {
        'Cache-Control': 'public, max-age=600'
      }
    }));

    const result = await onRequest({
      request: new Request('https://example.com/invite'),
      env: {} as any,
      data: {},
      next
    } as any);

    expect(result.headers.get('Cache-Control')).toBe('public, max-age=600');
    expect(result.headers.get('X-Robots-Tag')).toBeNull();
  });

  it.each([
    'https://example.com/admin',
    'https://example.com/admin/guests',
    'https://example.com/auth/verify?token=abc'
  ])('enforces no-store headers for sensitive route %s', async (url) => {
    mockNonceBytes(4);
    const next = vi.fn(async () => new Response('ok', {
      headers: {
        'Cache-Control': 'public, max-age=600'
      }
    }));

    const result = await onRequest({
      request: new Request(url),
      env: {} as any,
      data: {},
      next
    } as any);

    expect(result.headers.get('Cache-Control')).toBe('no-store');
    expect(result.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    expect(next).toHaveBeenCalledOnce();
  });
});
