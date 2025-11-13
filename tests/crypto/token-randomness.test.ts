// ABOUTME: Verifies token generation uses sufficient randomness and entropy.
// ABOUTME: Ensures tokens cannot be predicted or brute-forced.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateToken, hashToken, hashEmail } from '../../src/lib/crypto';

describe('token generation randomness', () => {
  const originalGetRandomValues = crypto.getRandomValues.bind(crypto);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('generates 1000 unique tokens without collision', () => {
    const tokens = new Set<string>();

    for (let i = 0; i < 1000; i++) {
      tokens.add(generateToken());
    }

    expect(tokens.size).toBe(1000);
  });

  it('tokens are 43 characters (32 bytes base64url encoded) and URL safe', () => {
    for (let i = 0; i < 20; i++) {
      const token = generateToken();
      expect(token.length).toBe(43);
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it('encodes raw bytes deterministically (base64url, no padding)', () => {
    // This test focuses on encoding behavior only.
    const stubBytes = new Uint8Array(Array.from({ length: 32 }, (_, index) => index));
    const spy = vi.spyOn(crypto, 'getRandomValues').mockImplementation((target: Uint8Array) => {
      target.set(stubBytes);
      return target;
    });

    const token = generateToken();
    const expected = Buffer.from(stubBytes).toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    expect(token).toBe(expected);
    spy.mockRestore();
  });

  it('varies output when random bytes change', () => {
    const callBytes = [
      new Uint8Array(Array.from({ length: 32 }, () => 0)),
      new Uint8Array(Array.from({ length: 32 }, () => 255))
    ];
    let call = 0;
    const spy = vi.spyOn(crypto, 'getRandomValues').mockImplementation((target: Uint8Array) => {
      target.set(callBytes[call]);
      call = Math.min(call + 1, callBytes.length - 1);
      return target;
    });

    const first = generateToken();
    const second = generateToken();

    expect(first).not.toBe(second);
    spy.mockRestore();
  });

  it('generated tokens differ across many bits', () => {
    const decode = (token: string) =>
      Buffer.from(token.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

    const a = decode(generateToken());
    const b = decode(generateToken());

    let differingBits = 0;
    for (let i = 0; i < a.length; i++) {
      differingBits += (a[i] ^ b[i]).toString(2).replace(/0/g, '').length;
    }

    expect(differingBits).toBeGreaterThan(80);
  });
});

describe('token hashing', () => {
  const SECRET = 'test-secret-key';

  it('produces consistent hashes for same input', async () => {
    const token = 'test-token-123';

    const hash1 = await hashToken(token, SECRET);
    const hash2 = await hashToken(token, SECRET);

    expect(hash1).toBe(hash2);
  });

  it('produces different hashes for different inputs', async () => {
    const hash1 = await hashToken('token1', SECRET);
    const hash2 = await hashToken('token2', SECRET);

    expect(hash1).not.toBe(hash2);
  });

  it('is case-sensitive', async () => {
    const lowerHash = await hashToken('abc123', SECRET);
    const upperHash = await hashToken('ABC123', SECRET);

    expect(lowerHash).not.toBe(upperHash);
  });

  it('does not trim whitespace', async () => {
    const baseHash = await hashToken('token', SECRET);
    const paddedHash = await hashToken('token ', SECRET);
    const leadingHash = await hashToken(' token', SECRET);

    expect(paddedHash).not.toBe(baseHash);
    expect(leadingHash).not.toBe(baseHash);
  });

  it('produces different hashes with different secrets', async () => {
    const token = 'same-token';

    const hash1 = await hashToken(token, 'secret1');
    const hash2 = await hashToken(token, 'secret2');

    expect(hash1).not.toBe(hash2);
  });

  it('hash output is URL-safe base64', async () => {
    const hash = await hashToken('test', SECRET);

    // Should not contain + / or =
    expect(hash).not.toMatch(/[+/=]/);
    expect(hash.length).toBe(43);
  });
});

describe('email hashing', () => {
  const SECRET = 'test-secret-key';

  it('normalizes email casing before hashing', async () => {
    const normalized = await hashEmail('user@example.com', SECRET);
    const upper = await hashEmail('USER@EXAMPLE.COM', SECRET);
    const mixed = await hashEmail('UsEr@ExAmPlE.cOm', SECRET);

    expect(upper).toBe(normalized);
    expect(mixed).toBe(normalized);
  });

  it('trims whitespace before hashing', async () => {
    const normalized = await hashEmail('user@example.com', SECRET);
    const padded = await hashEmail('  user@example.com  ', SECRET);
    const leading = await hashEmail(' user@example.com', SECRET);
    const trailing = await hashEmail('user@example.com ', SECRET);

    expect(padded).toBe(normalized);
    expect(leading).toBe(normalized);
    expect(trailing).toBe(normalized);
  });

  it('normalizes both casing and whitespace together', async () => {
    const normalized = await hashEmail('user@example.com', SECRET);
    const messy = await hashEmail('  USER@EXAMPLE.COM  ', SECRET);

    expect(messy).toBe(normalized);
  });

  it('treats different emails as different even after normalization', async () => {
    const hash1 = await hashEmail('user1@example.com', SECRET);
    const hash2 = await hashEmail('user2@example.com', SECRET);

    expect(hash1).not.toBe(hash2);
  });

  it('is deterministic (same email always produces same hash)', async () => {
    const email = 'test@example.com';

    const hash1 = await hashEmail(email, SECRET);
    const hash2 = await hashEmail(email, SECRET);
    const hash3 = await hashEmail(email, SECRET);

    expect(hash2).toBe(hash1);
    expect(hash3).toBe(hash1);
    expect(hash1.length).toBe(43);
  });

  it('handles unicode characters in email addresses', async () => {
    const email = 'iñtërnâtiônàl@example.eu';
    const hash = await hashEmail(email, SECRET);
    const hashAgain = await hashEmail(email, SECRET);

    expect(hash).toBe(hashAgain);
    expect(hash.length).toBe(43);
  });
});
