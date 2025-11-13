// ABOUTME: Ensures admin endpoints enforce Cloudflare Access JWT gate.
// ABOUTME: Fails if handlers skip requireAccessAssertion.

import { describe, expect, it, vi } from 'vitest';
import { createMockD1 } from '../../helpers/mock-d1';
import { onRequestGet as guestsGet } from '../../../functions/admin/guests';
import { onRequestGet as eventGet } from '../../../functions/admin/event';
import { onRequestGet as auditGet } from '../../../functions/admin/audit';

vi.mock('../../../src/lib/access', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/lib/access')>();
  return {
    ...actual,
    requireAccessAssertion: vi.fn(actual.requireAccessAssertion)
  };
});

const { requireAccessAssertion } = await import('../../../src/lib/access');

const toEnv = (DB: unknown) =>
  ({
    DB,
    KEK_B64: 'secret',
    ACCESS_AUD: 'audience',
    ACCESS_JWT_ISS: 'https://example.cloudflareaccess.com'
  }) as any;

describe('admin access enforcement', () => {
  beforeEach(() => {
    vi.mocked(requireAccessAssertion).mockClear();
  });

  it('admin/guests denies requests without Access JWT', async () => {
    const { DB, calls } = createMockD1(() => ({ results: [] }));

    const response = await guestsGet({
      request: new Request('https://example.com/admin/guests'),
      env: toEnv(DB)
    } as any);

    expect(requireAccessAssertion).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(0);
    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe('Unauthorized');
  });

  it('admin/event denies requests without Access JWT', async () => {
    const { DB, calls } = createMockD1(() => ({ results: [] }));

    const response = await eventGet({
      request: new Request('https://example.com/admin/event'),
      env: toEnv(DB)
    } as any);

    expect(requireAccessAssertion).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(0);
    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe('Unauthorized');
  });

  it('admin/audit denies requests without Access JWT', async () => {
    const spy = vi.fn();
    const { DB } = createMockD1((query, method, params) => {
      spy({ query, method, params });
      return { results: [] };
    });

    const response = await auditGet({
      request: new Request('https://example.com/admin/audit'),
      env: toEnv(DB)
    } as any);

    expect(requireAccessAssertion).toHaveBeenCalledTimes(1);
    expect(spy).not.toHaveBeenCalled();
    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe('Unauthorized');
  });
});

