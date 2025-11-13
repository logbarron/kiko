import type { PagesFunction, Response as CfResponse } from '@cloudflare/workers-types';
import Stripe from 'stripe';
import { validateSession } from '../../src/lib/cookies';
import { logError } from '../../src/lib/logger';
import { isAllowedOrigin } from '../../src/lib/origin';
import { checkRateLimit } from '../../src/lib/ratelimit';
import { createStripeClient } from '../../src/lib/stripe';
import type { Env } from '../../src/types';

const SESSION_EXPIRED_MESSAGE = 'Session expired. Please refresh the page.';
const MIN_AMOUNT_CENTS = 100; // $1

function jsonResponse(body: unknown, status: number): CfResponse {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  }) as unknown as CfResponse;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
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

    const stripeCreatePerHour = Number.parseInt(env.STRIPE_CREATE_PER_HOUR || '10', 10);
    const stripeAllowed = await checkRateLimit(env, `stripe:create:${session.guest_id}`, stripeCreatePerHour, 3600);
    if (!stripeAllowed) {
      return jsonResponse({ error: 'Too many requests.' }, 429);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'Invalid request payload.' }, 400);
    }

    const { amountUsd } = (body ?? {}) as { amountUsd?: unknown };

    const numericAmount = typeof amountUsd === 'number'
      ? amountUsd
      : typeof amountUsd === 'string'
        ? Number(amountUsd)
        : NaN;

    if (!Number.isFinite(numericAmount)) {
      return jsonResponse({ error: 'Enter a valid amount.' }, 400);
    }

    const amountCents = Math.round(numericAmount * 100);
    if (!Number.isSafeInteger(amountCents) || amountCents < MIN_AMOUNT_CENTS) {
      return jsonResponse({ error: 'Minimum contribution is $1.' }, 400);
    }

    const stripe = createStripeClient(env.STRIPE_SECRET_KEY);
    const metadataAmount = (amountCents / 100).toFixed(2);

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      ui_mode: 'custom',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: amountCents,
          product_data: {
            name: 'Honeymoon Fund Contribution'
          }
        },
        quantity: 1
      }],
      automatic_tax: { enabled: false },
      metadata: {
        // TODO: Change to your project name
        app: 'TODO_YOUR_PROJECT_NAME',
        contribution_dollars: metadataAmount,
        guest_id: session.guest_id.toString()
      },
      return_url: `${env.APP_BASE_URL}/event?session_id={CHECKOUT_SESSION_ID}`
    }, {
      idempotencyKey: crypto.randomUUID()
    });

    if (!checkoutSession.client_secret) {
      logError('stripe.create-session', new Error('Missing client_secret on Checkout Session.'));
      return jsonResponse({ error: 'Stripe is not available right now.' }, 500);
    }

    return jsonResponse({
      clientSecret: checkoutSession.client_secret,
      sessionId: checkoutSession.id
    }, 201);
  } catch (error) {
    if (error instanceof Stripe.errors.StripeError) {
      logError('stripe.create-session', error);
      const status = error.statusCode && error.statusCode >= 400 && error.statusCode < 600 ? error.statusCode : 400;
      return jsonResponse({
        error: error.message || 'Stripe rejected this request. Please try again.'
      }, status);
    }

    logError('stripe.create-session', error);
    return jsonResponse({ error: 'Stripe is not available right now.' }, 500);
  }
};
