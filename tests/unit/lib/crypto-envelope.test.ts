// ABOUTME: Tests envelope encryption helpers for roundtrip integrity.
// ABOUTME: Ensures decryptJson enforces additional authenticated data matching.

import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { decryptJson, encryptJson } from '../../../src/lib/crypto';

const KEK_B64 = Buffer.from(Array.from({ length: 32 }, (_, index) => index + 1)).toString('base64');

describe('encryptJson and decryptJson', () => {
  it('round-trips structured payloads with matching metadata', async () => {
    const payload = {
      email: 'guest@example.com',
      party: [
        { memberId: 'primary', role: 'primary' }
      ]
    };

    const encrypted = await encryptJson(payload, KEK_B64, 'guests', '42', 'profile');
    const decrypted = await decryptJson(encrypted, KEK_B64, 'guests', '42', 'profile');

    expect(decrypted).toEqual(payload);
  });

  it('fails decryption when additional authenticated data mismatches', async () => {
    const encrypted = await encryptJson({ sample: true }, KEK_B64, 'guests', '7', 'profile');

    await expect(
      decryptJson(encrypted, KEK_B64, 'guests', '8', 'profile')
    ).rejects.toThrow();
  });

  it('fails decryption when using a different KEK', async () => {
    const encrypted = await encryptJson({ sample: true }, KEK_B64, 'guests', '9', 'profile');
    const differentKEK = Buffer.from(Array.from({ length: 32 }, (_, i) => 255 - i)).toString('base64');

    await expect(
      decryptJson(encrypted, differentKEK, 'guests', '9', 'profile')
    ).rejects.toThrow();
  });

  it('rejects tampered ciphertext content', async () => {
    const encrypted = await encryptJson({ sample: true }, KEK_B64, 'guests', '10', 'profile');
    const payload = JSON.parse(encrypted) as Record<string, string>;
    const ciphertextBytes = Buffer.from(payload.ciphertext, 'base64');
    ciphertextBytes[0] = ciphertextBytes[0] ^ 0xff;
    payload.ciphertext = Buffer.from(ciphertextBytes).toString('base64');
    const tampered = JSON.stringify(payload);

    await expect(
      decryptJson(tampered, KEK_B64, 'guests', '10', 'profile')
    ).rejects.toThrow();
  });
});
