// ABOUTME: Validates the mock D1 helper keeps bound parameter state across chains.
// ABOUTME: Protects tests that assert on recorded SQL telemetry.

import { describe, expect, it, vi } from 'vitest';
import { createMockD1 } from './mock-d1';

describe('createMockD1', () => {
  it('retains previously bound params when chaining bind calls', async () => {
    const dispatcher = vi.fn(async () => ({ ok: true }));
    const { DB, calls } = createMockD1(dispatcher);

    await DB.prepare('SELECT * FROM test WHERE id = ? AND token = ? AND scope = ?')
      .bind('user-1')
      .bind('token-2', 'scope-3')
      .first();

    expect(dispatcher).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.params).toEqual(['user-1', 'token-2', 'scope-3']);
  });
});
