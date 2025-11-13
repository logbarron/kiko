import type { PagesFunction, Response as CfResponse } from '@cloudflare/workers-types';
import { validateSession } from '../../src/lib/cookies';
import { logError } from '../../src/lib/logger';
import { isAllowedOrigin } from '../../src/lib/origin';
import type { Env } from '../../src/types';

function jsonResponse(body: unknown, status: number): CfResponse {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  }) as unknown as CfResponse;
}

const SESSION_EXPIRED_MESSAGE = 'Session expired. Please refresh the page.';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    if (!isAllowedOrigin(request, env.APP_BASE_URL)) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const cookieHeader = request.headers.get('Cookie');
    if (!cookieHeader) {
      return jsonResponse({ error: SESSION_EXPIRED_MESSAGE }, 401);
    }

    const session = await validateSession(cookieHeader, env);
    if (!session) {
      return jsonResponse({ error: SESSION_EXPIRED_MESSAGE }, 401);
    }

    const publishableKey = env.STRIPE_PUBLISHABLE_KEY;
    if (!publishableKey) {
      logError('stripe.config', new Error('Missing STRIPE_PUBLISHABLE_KEY'));
      return jsonResponse({ error: 'Stripe is not configured.' }, 500);
    }

    return jsonResponse({ publishableKey }, 200);
  } catch (error) {
    logError('stripe.config', error);
    return jsonResponse({ error: 'Stripe is not available right now.' }, 500);
  }
};
