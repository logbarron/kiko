// ABOUTME: Verifies AAD (Additional Authenticated Data) binding in envelope encryption.
// ABOUTME: Ensures ciphertext cannot be reused in different contexts (wrong table/record/purpose).

import { describe, expect, it } from 'vitest';
import { encryptJson, decryptJson } from '../../src/lib/crypto';

function generateTestKEK(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes));
}

describe('AAD enforcement', () => {
  const KEK_B64 = generateTestKEK();

  it('rejects decryption when table name differs', async () => {
    const payload = { email: 'test@example.com', secret: 'data' };

    const encrypted = await encryptJson(
      payload,
      KEK_B64,
      'guests',
      '42',
      'profile'
    );

    // Try to decrypt with wrong table name
    await expect(
      decryptJson(encrypted, KEK_B64, 'rsvps', '42', 'profile')
    ).rejects.toThrow();
  });

  it('rejects decryption when record ID differs', async () => {
    const payload = { email: 'test@example.com' };

    const encrypted = await encryptJson(
      payload,
      KEK_B64,
      'guests',
      '42',
      'profile'
    );

    // Try to decrypt with wrong record ID
    await expect(
      decryptJson(encrypted, KEK_B64, 'guests', '43', 'profile')
    ).rejects.toThrow();

    // Even slightly different ID should fail
    await expect(
      decryptJson(encrypted, KEK_B64, 'guests', '420', 'profile')
    ).rejects.toThrow();
  });

  it('rejects decryption when purpose differs', async () => {
    const payload = { data: 'sensitive' };

    const encrypted = await encryptJson(
      payload,
      KEK_B64,
      'guests',
      '42',
      'profile'
    );

    // Try to decrypt with wrong purpose
    await expect(
      decryptJson(encrypted, KEK_B64, 'guests', '42', 'rsvp')
    ).rejects.toThrow();

    await expect(
      decryptJson(encrypted, KEK_B64, 'guests', '42', 'audit')
    ).rejects.toThrow();
  });

  it('succeeds when AAD matches exactly', async () => {
    const payload = {
      email: 'test@example.com',
      party: [{ name: 'Guest' }],
      secretNumber: 42
    };

    const table = 'guests';
    const recordId = '99';
    const purpose = 'profile';

    const encrypted = await encryptJson(payload, KEK_B64, table, recordId, purpose);
    const decrypted = await decryptJson(encrypted, KEK_B64, table, recordId, purpose);

    expect(decrypted).toEqual(payload);
  });

  it('prevents ciphertext from being used across different guests', async () => {
    const guestAProfile = { email: 'guestA@example.com', vip: true };
    const guestBId = '100';

    // Encrypt for guest A
    const encrypted = await encryptJson(
      guestAProfile,
      KEK_B64,
      'guests',
      '99',
      'profile'
    );

    // Attacker tries to use guest A's encrypted profile for guest B
    await expect(
      decryptJson(encrypted, KEK_B64, 'guests', guestBId, 'profile')
    ).rejects.toThrow();
  });

  it('prevents ciphertext from being moved between tables', async () => {
    const data = { sensitive: 'info', amount: 1000 };

    // Encrypt for guests table
    const encrypted = await encryptJson(data, KEK_B64, 'guests', '1', 'data');

    // Attacker tries to use it in rsvps table
    await expect(
      decryptJson(encrypted, KEK_B64, 'rsvps', '1', 'data')
    ).rejects.toThrow();

    // Or event table
    await expect(
      decryptJson(encrypted, KEK_B64, 'event', '1', 'data')
    ).rejects.toThrow();
  });

  it('AAD is case-sensitive', async () => {
    const payload = { test: 'data' };

    const encrypted = await encryptJson(payload, KEK_B64, 'Guests', '1', 'Profile');

    // Different casing should fail
    await expect(
      decryptJson(encrypted, KEK_B64, 'guests', '1', 'Profile')
    ).rejects.toThrow();

    await expect(
      decryptJson(encrypted, KEK_B64, 'Guests', '1', 'profile')
    ).rejects.toThrow();
  });

  it('AAD components cannot have extra spaces or formatting', async () => {
    const payload = { test: 'data' };

    const encrypted = await encryptJson(payload, KEK_B64, 'guests', '42', 'profile');

    // Extra spaces should fail
    await expect(
      decryptJson(encrypted, KEK_B64, 'guests ', '42', 'profile')
    ).rejects.toThrow();

    await expect(
      decryptJson(encrypted, KEK_B64, 'guests', ' 42', 'profile')
    ).rejects.toThrow();

    await expect(
      decryptJson(encrypted, KEK_B64, 'guests', '42 ', 'profile')
    ).rejects.toThrow();
  });

  it('empty strings in AAD are distinct from each other', async () => {
    const payload = { test: 'data' };

    // This should work (empty string for recordId is allowed)
    const encrypted = await encryptJson(payload, KEK_B64, 'table', '', 'purpose');
    const decrypted = await decryptJson(encrypted, KEK_B64, 'table', '', 'purpose');

    expect(decrypted).toEqual(payload);

    // But decrypting with non-empty recordId should fail
    await expect(
      decryptJson(encrypted, KEK_B64, 'table', '1', 'purpose')
    ).rejects.toThrow();
  });
});
