import Stripe from 'stripe';

export function createStripeClient(secretKey: string): Stripe {
  if (!secretKey) {
    throw new Error('Missing STRIPE_SECRET_KEY');
  }

  return new Stripe(secretKey, {
    httpClient: Stripe.createFetchHttpClient(),
  });
}

export type { Stripe };
