// ABOUTME: Tests the in-memory KV helper used for rate limit integration.
// ABOUTME: Ensures expirationTTL and deletion semantics match Cloudflare KV subset.

import { describe, expect, it } from 'vitest';
import { createInMemoryKv } from './in-memory-kv';

describe('createInMemoryKv', () => {
  it('stores and retrieves values', async () => {
    const kv = createInMemoryKv(() => 100);
    await kv.put('key', 'value');

    await expect(kv.get('key')).resolves.toBe('value');
    expect(kv.size()).toBe(1);
  });

  it('applies expiration TTL', async () => {
    let current = 100;
    const kv = createInMemoryKv(() => current);

    await kv.put('limited', '1', { expirationTtl: 10 });
    await expect(kv.get('limited')).resolves.toBe('1');

    current += 11;
    await expect(kv.get('limited')).resolves.toBeNull();
    expect(kv.size()).toBe(0);
  });

  it('allows manual time advancement helper', async () => {
    const kv = createInMemoryKv(() => 100);
    await kv.put('temp', 'x', { expirationTtl: 5 });
    expect(kv.size()).toBe(1);

    kv.advanceTime(6);
    await expect(kv.get('temp')).resolves.toBeNull();
  });

  it('supports delete and clear operations', async () => {
    const kv = createInMemoryKv(() => 100);
    await kv.put('a', '1');
    await kv.put('b', '2');
    expect(kv.size()).toBe(2);

    await kv.delete('a');
    await expect(kv.get('a')).resolves.toBeNull();
    expect(kv.size()).toBe(1);

    kv.clear();
    expect(kv.size()).toBe(0);
  });
});

