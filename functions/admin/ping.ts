import type { PagesFunction, Response as CfResponse } from '@cloudflare/workers-types';
import { requireAccessAssertion } from '../../src/lib/access';
import type { Env } from '../../src/types';

/**
 * Lightweight session check endpoint for proactive expiration detection.
 * Returns 204 if session valid, 401 if expired/invalid.
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  const authResult = await requireAccessAssertion(request, env);
  if (authResult instanceof Response) {
    return authResult as unknown as CfResponse;
  }

  return new Response(null, {
    status: 204,
    headers: {
      'Cache-Control': 'no-store'
    }
  }) as unknown as CfResponse;
};
