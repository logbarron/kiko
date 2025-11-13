import type { PagesFunction, Response as CfResponse } from '@cloudflare/workers-types';
import Stripe from 'stripe';
import { validateSession } from '../../src/lib/cookies';
import { logError } from '../../src/lib/logger';
import { isAllowedOrigin } from '../../src/lib/origin';
import { checkRateLimit } from '../../src/lib/ratelimit';
import { createStripeClient } from '../../src/lib/stripe';
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

    const stripeStatusPerHour = Number.parseInt(env.STRIPE_STATUS_PER_HOUR || '30', 10);
    const statusAllowed = await checkRateLimit(env, `stripe:status:${session.guest_id}`, stripeStatusPerHour, 3600);
    if (!statusAllowed) {
      return jsonResponse({ error: 'Too many requests.' }, 429);
    }

    const url = new URL(request.url);
    const sessionId = url.searchParams.get('session_id')?.trim();
    if (!sessionId) {
      return jsonResponse({ error: 'Missing session_id parameter.' }, 400);
    }

    const stripe = createStripeClient(env.STRIPE_SECRET_KEY);
    const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent.latest_charge']
    });

    const checkoutGuestIdStr = checkoutSession.metadata?.guest_id;
    if (!checkoutGuestIdStr) {
      return jsonResponse({ error: 'Checkout Session not found.' }, 404);
    }

    const checkoutGuestId = parseInt(checkoutGuestIdStr, 10);
    if (!Number.isFinite(checkoutGuestId) || checkoutGuestId !== session.guest_id) {
      return jsonResponse({ error: 'Checkout Session not found.' }, 404);
    }

    let receiptUrl: string | null = null;
    const paymentIntent = checkoutSession.payment_intent;
    if (paymentIntent && typeof paymentIntent === 'object') {
      const expandedIntent = paymentIntent as Stripe.PaymentIntent;
      const latestCharge = expandedIntent.latest_charge;
      if (latestCharge && typeof latestCharge === 'object') {
        const charge = latestCharge as Stripe.Charge;
        if (charge.receipt_url) {
          receiptUrl = charge.receipt_url;
        }
      }
    }

    return jsonResponse({
      status: checkoutSession.status,
      amountTotal: checkoutSession.amount_total,
      currency: checkoutSession.currency,
      receiptUrl,
      email: checkoutSession.customer_details?.email ?? null
    }, 200);
  } catch (error) {
    if (error instanceof Stripe.errors.StripeError && error.statusCode === 404) {
      return jsonResponse({ error: 'Checkout Session not found.' }, 404);
    }

    logError('stripe.session-status', error);
    return jsonResponse({ error: 'Unable to fetch session status.' }, 500);
  }
};
