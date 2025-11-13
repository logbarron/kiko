// ABOUTME: Validates request size guardrails for JSON bodies.
// ABOUTME: Confirms small payloads succeed and oversize ones throw errors.

import { describe, expect, it } from 'vitest';
import { PayloadTooLargeError, readJsonWithinLimit } from '../../../src/lib/request';

describe('readJsonWithinLimit', () => {
  it('throws when payload exceeds limit', async () => {
    const body = JSON.stringify({ pad: 'x'.repeat(1024) });
    const request = new Request('https://example.com', { method: 'POST', body });
    await expect(readJsonWithinLimit(request, 512)).rejects.toBeInstanceOf(PayloadTooLargeError);
  });

  it('resolves with parsed data when payload is within limit', async () => {
    const payload = { message: 'hello' };
    const body = JSON.stringify(payload);
    const request = new Request('https://example.com', { method: 'POST', body });

    const result = await readJsonWithinLimit<typeof payload>(request, 1024);

    expect(result.data).toEqual(payload);
    expect(result.bytes).toBe(new TextEncoder().encode(body).length);
  });

  it('counts multibyte characters using byte length', async () => {
    const payload = { emoji: '🙂' };
    const body = JSON.stringify(payload);
    const request = new Request('https://example.com', { method: 'POST', body });

    const result = await readJsonWithinLimit<typeof payload>(request, 1024);

    expect(result.bytes).toBe(new TextEncoder().encode(body).length);
  });

  it('includes byte details on PayloadTooLargeError', async () => {
    const payload = { pad: 'x'.repeat(600) };
    const body = JSON.stringify(payload);
    const request = new Request('https://example.com', { method: 'POST', body });

    await expect(readJsonWithinLimit(request, 500)).rejects.toMatchObject({
      bytes: new TextEncoder().encode(body).length,
      maxBytes: 500,
      name: 'PayloadTooLargeError'
    });
  });

  it('allows payloads exactly at the limit', async () => {
    const payload = { pad: 'y'.repeat(100) };
    const body = JSON.stringify(payload);
    const bytes = new TextEncoder().encode(body).length;
    const request = new Request('https://example.com', { method: 'POST', body });

    const result = await readJsonWithinLimit<typeof payload>(request, bytes);
    expect(result.data).toEqual(payload);
    expect(result.bytes).toBe(bytes);
  });

  it('propagates JSON parse errors for invalid payloads', async () => {
    const body = '{"message": "oops"';
    const request = new Request('https://example.com', { method: 'POST', body });

    await expect(readJsonWithinLimit(request, 1024)).rejects.toBeInstanceOf(SyntaxError);
  });
});
