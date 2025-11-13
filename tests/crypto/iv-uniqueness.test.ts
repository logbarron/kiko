// ABOUTME: Verifies IV (initialization vector) uniqueness in encryption operations.
// ABOUTME: Prevents catastrophic nonce reuse attacks in AES-GCM encryption.

import { Buffer } from 'node:buffer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { encryptJson } from '../../src/lib/crypto';
import type { EncryptedPayload } from '../../src/types';

// Generate a valid 256-bit KEK for testing
function generateTestKEK(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes));
}

describe('IV uniqueness enforcement', () => {
  const KEK_B64 = generateTestKEK();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requests 12 random bytes for each IV', async () => {
    const spy = vi.spyOn(crypto, 'getRandomValues').mockImplementation((target: Uint8Array) => {
      return target.fill(0xaa);
    });

    await encryptJson({ test: true }, KEK_B64, 'table', '1', 'purpose');

    expect(spy).toHaveBeenCalledTimes(1);
    const callArg = spy.mock.calls[0][0] as Uint8Array;
    expect(callArg.length).toBe(12);
  });

  it('generates unique IVs across a sample of encryptions', async () => {
    const ivs = new Set<string>();
    for (let i = 0; i < 64; i++) {
      const encrypted = await encryptJson(
        { index: i },
        KEK_B64,
        'sample',
        `${i}`,
        'purpose'
      );
      const parsed: EncryptedPayload = JSON.parse(encrypted);
      ivs.add(parsed.iv);
    }

    expect(ivs.size).toBe(64);
  });

  it('generates different IVs even with identical inputs', async () => {
    const payload = { sensitive: 'data' };
    const table = 'guests';
    const recordId = '1';
    const purpose = 'profile';

    // Encrypt the exact same data with exact same AAD twice
    const encrypted1 = await encryptJson(payload, KEK_B64, table, recordId, purpose);
    const encrypted2 = await encryptJson(payload, KEK_B64, table, recordId, purpose);

    const parsed1: EncryptedPayload = JSON.parse(encrypted1);
    const parsed2: EncryptedPayload = JSON.parse(encrypted2);

    // IVs must be different
    expect(parsed1.iv).not.toBe(parsed2.iv);

    // Ciphertexts must also be different (because different IVs)
    expect(parsed1.ciphertext).not.toBe(parsed2.ciphertext);

    // But wrapped DEKs will be different too (each encryption generates new DEK)
    expect(parsed1.dek_wrapped).not.toBe(parsed2.dek_wrapped);
  });

  it('IV is 12 bytes (96 bits) as required by AES-GCM', async () => {
    const encrypted = await encryptJson(
      { test: true },
      KEK_B64,
      'table',
      '1',
      'purpose'
    );

    const parsed: EncryptedPayload = JSON.parse(encrypted);

    // Decode base64 IV and verify length
    const ivBytes = Uint8Array.from(atob(parsed.iv), c => c.charCodeAt(0));

    // AES-GCM requires 96-bit (12 byte) IV
    expect(ivBytes.length).toBe(12);
  });

  it('IV is not all zeros', async () => {
    const encrypted = await encryptJson(
      { test: true },
      KEK_B64,
      'table',
      '1',
      'purpose'
    );

    const parsed: EncryptedPayload = JSON.parse(encrypted);
    const ivBytes = Uint8Array.from(atob(parsed.iv), c => c.charCodeAt(0));

    // IV should not be all zeros (that would indicate broken RNG)
    const allZeros = ivBytes.every(byte => byte === 0);
    expect(allZeros).toBe(false);
  });

  it('IV has sufficient entropy (not sequential)', async () => {
    const encrypted1 = await encryptJson({ a: 1 }, KEK_B64, 't', '1', 'p');
    const encrypted2 = await encryptJson({ a: 2 }, KEK_B64, 't', '2', 'p');

    const parsed1: EncryptedPayload = JSON.parse(encrypted1);
    const parsed2: EncryptedPayload = JSON.parse(encrypted2);

    const iv1Bytes = Uint8Array.from(atob(parsed1.iv), c => c.charCodeAt(0));
    const iv2Bytes = Uint8Array.from(atob(parsed2.iv), c => c.charCodeAt(0));

    // IVs should not be sequential (iv2 != iv1 + 1)
    let sequential = true;
    for (let i = 0; i < 12; i++) {
      if (iv2Bytes[i] !== iv1Bytes[i] + 1 && iv2Bytes[i] !== iv1Bytes[i]) {
        sequential = false;
        break;
      }
    }

    expect(sequential).toBe(false);
  });

  it('encodes IV bytes deterministically when RNG is stubbed', async () => {
    const bytes = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    const spy = vi.spyOn(crypto, 'getRandomValues').mockImplementation((target: Uint8Array) => {
      target.set(bytes);
      return target;
    });

    const encrypted = await encryptJson({ deterministic: true }, KEK_B64, 'table', '42', 'purpose');
    const parsed: EncryptedPayload = JSON.parse(encrypted);
    const expected = Buffer.from(bytes).toString('base64');

    expect(parsed.iv).toBe(expected);
    spy.mockRestore();
  });
});
