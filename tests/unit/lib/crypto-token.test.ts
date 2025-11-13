import { describe, expect, it } from 'vitest';
import { hashEmail, hashToken } from '../../../src/lib/crypto';

const SECRET = 'test-secret';

describe('crypto hashing helpers', () => {
  it('normalizes email casing and whitespace before hashing', async () => {
    const normalized = await hashEmail('user@example.com', SECRET);
    const messy = await hashEmail(' User@Example.com ', SECRET);

    expect(messy).toEqual(normalized);
  });

  it('does not normalize token casing', async () => {
    const lower = await hashToken('abc123', SECRET);
    const upper = await hashToken('ABC123', SECRET);

    expect(upper).not.toEqual(lower);
  });

  it('does not trim token whitespace', async () => {
    const base = await hashToken('token', SECRET);
    const padded = await hashToken('token ', SECRET);

    expect(padded).not.toEqual(base);
  });

  it('produces deterministic base64url output of fixed length', async () => {
    const emailHash = await hashEmail('user@example.com', SECRET);
    const tokenHash = await hashToken('token-value', SECRET);

    const base64UrlPattern = /^[A-Za-z0-9_-]+$/;
    expect(emailHash).toMatch(base64UrlPattern);
    expect(tokenHash).toMatch(base64UrlPattern);
    expect(emailHash.length).toBe(tokenHash.length);

    const repeatEmailHash = await hashEmail('user@example.com', SECRET);
    const repeatTokenHash = await hashToken('token-value', SECRET);
    expect(repeatEmailHash).toBe(emailHash);
    expect(repeatTokenHash).toBe(tokenHash);
  });

  it('handles empty strings safely', async () => {
    const emailHash = await hashEmail('', SECRET);
    const tokenHash = await hashToken('', SECRET);

    expect(emailHash).toBeTruthy();
    expect(tokenHash).toBeTruthy();
    expect(emailHash.length).toBe(tokenHash.length);
    expect(emailHash.length).toBeGreaterThan(40);
  });

  it('supports very long inputs without throwing', async () => {
    const longEmail = `${'alice'.repeat(1000)}@example.com`;
    const longToken = 't'.repeat(5000);

    await expect(hashEmail(longEmail, SECRET)).resolves.toMatch(/^[A-Za-z0-9_-]+$/);
    await expect(hashToken(longToken, SECRET)).resolves.toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
