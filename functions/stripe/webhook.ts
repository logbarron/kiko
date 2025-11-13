import type { PagesFunction, Response as CfResponse } from '@cloudflare/workers-types';
import Stripe from 'stripe';
import { logError } from '../../src/lib/logger';
import { createStripeClient } from '../../src/lib/stripe';
import type { Env } from '../../src/types';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const stripe = createStripeClient(env.STRIPE_SECRET_KEY);

  let body: string;
  try {
    body = await request.text();
  } catch (error) {
    logError('stripe.webhook.body', error);
    return new Response('Invalid body', { status: 400 }) as unknown as CfResponse;
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return new Response('Missing signature', { status: 400 }) as unknown as CfResponse;
  }

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      env.STRIPE_WEBHOOK_SECRET,
      undefined,
      Stripe.createSubtleCryptoProvider()
    );
  } catch (error) {
    logError('stripe.webhook.verify', error);
    return new Response('Invalid signature', { status: 400 }) as unknown as CfResponse;
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const guestIdStr = session.metadata?.guest_id;

        if (guestIdStr) {
          const guestId = parseInt(guestIdStr, 10);
          if (Number.isFinite(guestId)) {
            const now = Math.floor(Date.now() / 1000);
            await env.DB.prepare(
              'INSERT INTO audit_events (guest_id, type, created_at) VALUES (?, ?, ?)'
            ).bind(guestId, 'contribution_completed', now).run();
          }
        }
        break;
      }
      case 'checkout.session.async_payment_failed': {
        logError('stripe.webhook.async_payment_failed', new Error(`Checkout session async payment failed: ${event.id}`));
        break;
      }
      default:
        break;
    }
  } catch (error) {
    logError('stripe.webhook.handler', error);
    // Still acknowledge to avoid retries; issue is logged for investigation.
  }

  return new Response(null, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store'
    }
  }) as unknown as CfResponse;
};
