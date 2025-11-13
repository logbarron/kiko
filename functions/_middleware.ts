import type { PagesFunction, Response as CfResponse } from '@cloudflare/workers-types';
import type { Env } from '../src/types';

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, next } = context;

  if (typeof globalThis !== 'undefined') {
    (globalThis as any).__ENABLE_DEBUG_LOGS__ = env.ENABLE_DEBUG_LOGS === 'true';
  }
  
  // Generate CSP nonce
  const nonceArray = new Uint8Array(16);
  crypto.getRandomValues(nonceArray);
  const nonce = btoa(String.fromCharCode(...nonceArray));
  
  // Store nonce in context for use by other functions
  context.data = { ...context.data, nonce };
  
  // Get response from next handler
  const response = await next();
  
  // Get existing CSP header and replace nonce placeholder
  const csp = response.headers.get('Content-Security-Policy');
  if (csp) {
    response.headers.set(
      'Content-Security-Policy',
      csp.replace(/{NONCE}/g, nonce)
    );
  } else {
    // Belt-and-suspenders: apply a safe default CSP for Function responses
    const defaultCsp = "default-src 'none'; base-uri 'self'; frame-ancestors 'none'; connect-src 'self' https://api.stripe.com https://m.stripe.network; img-src 'self' data: https://q.stripe.com https://b.stripecdn.com; font-src 'self' https://use.typekit.net; style-src 'self' 'nonce-{NONCE}' https://use.typekit.net https://p.typekit.net https://b.stripecdn.com; script-src 'self' 'nonce-{NONCE}' https://challenges.cloudflare.com https://js.stripe.com; frame-src https://challenges.cloudflare.com https://js.stripe.com https://checkout.stripe.com; form-action 'self'; manifest-src 'self'";
    response.headers.set(
      'Content-Security-Policy',
      defaultCsp.replace(/{NONCE}/g, nonce)
    );
  }
  
  // Add security headers if not already set
  if (!response.headers.has('X-Content-Type-Options')) {
    response.headers.set('X-Content-Type-Options', 'nosniff');
  }
  if (!response.headers.has('X-Frame-Options')) {
    response.headers.set('X-Frame-Options', 'DENY');
  }
  if (!response.headers.has('Referrer-Policy')) {
    response.headers.set('Referrer-Policy', 'no-referrer');
  }
  
  // Set Cache-Control for sensitive routes
  const url = new URL(request.url);
  if (
    url.pathname === '/event' ||
    url.pathname === '/admin' ||
    url.pathname.startsWith('/admin/') ||
    url.pathname.startsWith('/auth/verify') ||
    url.pathname.startsWith('/rsvp') ||
    url.pathname.startsWith('/stripe/')
  ) {
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }
  
  return response as unknown as CfResponse;
};
