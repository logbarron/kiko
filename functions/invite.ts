import type { PagesFunction, Response as CfResponse } from '@cloudflare/workers-types';
import { verifyTurnstile } from '../src/lib/turnstile';
import { checkRateLimit } from '../src/lib/ratelimit';
import { decryptJson, encryptJson, hashEmail, generateToken, hashToken } from '../src/lib/crypto';
import { sendMagicLinkEmail } from '../src/lib/gmail';
import { logError } from '../src/lib/logger';
import { PayloadTooLargeError } from '../src/lib/request';
import { pageStyles, renderNotice, escapeHtml } from '../src/lib/pageStyles';
import { renderThemeToggle, renderThemeScript } from '../src/views/shared/themeToggle';
import type { Env, EventDetails } from '../src/types';

function renderInvitePage(
  env: Env,
  nonce: string | undefined,
  opts?: { error?: string; success?: string; emailValue?: string }
): string {
  const ttlMin = Number.parseInt(env.MAGIC_LINK_TTL_MIN || '10', 10) || 10;
  const emailValue = opts?.emailValue ? escapeHtml(opts.emailValue) : '';
  const noticeHtml = opts?.error
    ? renderNotice('error', opts.error)
    : opts?.success
    ? renderNotice('success', opts.success)
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Wedding Invitation - Access</title>
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
    ${pageStyles.getBaseStyles(nonce)}
    ${renderInviteThemeStyles(nonce)}
    <meta name="robots" content="noindex,nofollow">
    <meta name="referrer" content="no-referrer">
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">
    <link rel="preconnect" href="https://challenges.cloudflare.com" crossorigin>
    <link rel="dns-prefetch" href="https://challenges.cloudflare.com">
    <meta name="color-scheme" content="light dark">
    <meta name="theme-color" content="#fafafa" media="(prefers-color-scheme: light)">
    <meta name="theme-color" content="#05070f" media="(prefers-color-scheme: dark)">
    <meta name="format-detection" content="telephone=no">
    <meta name="description" content="Access your personalized wedding invitation and RSVP.">
</head>
<body>
    <div class="container">
      <div class="theme-toggle-slot">
        ${renderThemeToggle()}
      </div>
      <h1>Let's confirm it's you</h1>
      <p>Enter the email that received the invite, to request a secure one-time link</p>
      ${noticeHtml}
      <form method="POST" action="/invite" novalidate>
        <div class="form-group">
          <label for="email">Your email address</label>
          <input
            type="email"
            id="email"
            name="email"
            value="${emailValue}"
            required
            autocomplete="email"
            placeholder="you@example.com"
            inputmode="email"
            aria-required="true"
            aria-describedby="email-hint"
          >
        </div>
        <div class="cf-turnstile" aria-label="Security verification" data-sitekey="${env.TURNSTILE_SITE_KEY}"></div>
        <button type="submit" aria-label="Send access link to my email">
          Send Magic Link
        </button>
        <p class="helper-text" id="email-hint">We'll email you a link to view the invitation and RSVP.</p>
      </form>
      <details>
        <summary>Need help?</summary>
        <div>
          <p><strong>Here's what happens:</strong></p>
          <ol>
            <li>Enter the same email address where you received our invitation</li>
            <li>We'll immediately send you a new email with a special link</li>
            <li>Click that link to see all the wedding details and RSVP</li>
          </ol>
          <p><strong>Good to know:</strong></p>
          <ul>
            <li>The link expires after ${ttlMin} minutes for privacy</li>
            <li>Each link only works once</li>
            <li>Need to come back? Just request a new link anytime</li>
            <li>Can't find our emails? Check your spam or promotions folder</li>
          </ul>
        </div>
      </details>
    </div>
    ${renderThemeScript(nonce, { storageKey: 'guest-theme' })}
</body>
</html>`;
}

function renderInviteThemeStyles(nonce: string | undefined): string {
  return `<style${nonce ? ` nonce="${nonce}"` : ''}>
    :root {
      color-scheme: light;
    }

    body {
      --invite-bg: #fafafa;
      --invite-surface: #ffffff;
      --invite-surface-muted: #f3f4f6;
      --invite-border: #e5e7eb;
      --invite-heading: #0f172a;
      --invite-text: #334155;
      --invite-muted: #64748b;
      --invite-helper: #64748b;
      --invite-placeholder: #94a3b8;
      --invite-button-bg: #111827;
      --invite-button-hover: #1f2937;
      --invite-button-text: #f8fafc;
      --invite-input-bg: #ffffff;
      --invite-input-border: #d1d5db;
      --invite-input-text: #0f172a;
      --invite-alert-success-bg: #d1fae5;
      --invite-alert-success-border: #86efac;
      --invite-alert-success-text: #065f46;
      --invite-alert-error-bg: #fef2f2;
      --invite-alert-error-border: #fecaca;
      --invite-alert-error-text: #7f1d1d;
      --invite-alert-info-bg: #ecfeff;
      --invite-alert-info-border: #bae6fd;
      --invite-alert-info-text: #0f172a;
      --invite-divider: #e5e7eb;
      --invite-summary: #334155;
    }

    body {
      background: var(--invite-bg);
      color: var(--invite-text);
      transition: background 0.3s ease, color 0.3s ease;
    }

    .container {
      background: var(--invite-surface);
      border-color: var(--invite-border);
      padding-top: 64px;
      position: relative;
      transition: background 0.3s ease, border-color 0.3s ease, color 0.3s ease;
    }

    h1 {
      color: var(--invite-heading);
    }

    p,
    label,
    summary,
    details > div p,
    details li {
      color: var(--invite-text);
    }

    details > div p strong {
      color: var(--invite-heading);
    }

    details {
      border-top-color: var(--invite-divider);
    }

    summary {
      color: var(--invite-summary);
    }

    summary::before {
      color: var(--invite-muted);
    }

    .helper-text,
    .text-muted {
      color: var(--invite-helper);
    }

    input[type="email"] {
      background: var(--invite-input-bg);
      color: var(--invite-input-text);
      border-color: var(--invite-input-border);
      transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease, color 0.2s ease;
    }

    input[type="email"]::placeholder {
      color: var(--invite-placeholder);
    }

    input[type="email"]:focus-visible {
      border-color: var(--invite-button-hover);
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.3);
    }

    button[type="submit"] {
      background: var(--invite-button-bg);
      color: var(--invite-button-text);
      transition: transform 0.2s ease, background 0.2s ease;
    }

    button[type="submit"]:hover {
      background: var(--invite-button-hover);
    }

    .alert {
      background: var(--invite-surface-muted);
      border-color: var(--invite-border);
      color: var(--invite-text);
    }

    .alert-success {
      background: var(--invite-alert-success-bg);
      border-color: var(--invite-alert-success-border);
      color: var(--invite-alert-success-text);
    }

    .alert-error {
      background: var(--invite-alert-error-bg);
      border-color: var(--invite-alert-error-border);
      color: var(--invite-alert-error-text);
    }

    .alert-info {
      background: var(--invite-alert-info-bg);
      border-color: var(--invite-alert-info-border);
      color: var(--invite-alert-info-text);
    }

    .theme-toggle-slot {
      position: absolute;
      top: 16px;
      right: 16px;
    }

    .theme-toggle {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border: none;
      background: transparent;
      color: var(--invite-summary);
      cursor: pointer;
      border-radius: 999px;
      transition: color 0.2s ease, box-shadow 0.2s ease;
    }

    .theme-toggle:hover {
      color: var(--invite-heading);
    }

    .theme-toggle:focus-visible {
      outline: none;
      box-shadow: 0 0 0 3px rgba(148, 163, 184, 0.35);
    }

    .theme-toggle-icon {
      width: 20px;
      height: 20px;
      stroke: currentColor;
      stroke-width: 1.7;
      fill: none;
      pointer-events: none;
    }

    .theme-icon-moon {
      display: none;
    }

    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    @media (max-width: 540px) {
      .container {
        padding-top: 56px;
      }

      .theme-toggle-slot {
        top: 12px;
        right: 12px;
      }
    }

    @media (prefers-color-scheme: dark) {
      body:not([data-theme]) {
        color-scheme: dark;
        --invite-bg: #05070f;
        --invite-surface: rgba(8, 12, 20, 0.96);
        --invite-surface-muted: rgba(255, 255, 255, 0.08);
        --invite-border: rgba(148, 163, 184, 0.35);
        --invite-heading: #f8fafc;
        --invite-text: rgba(239, 245, 253, 0.92);
        --invite-muted: #94a3b8;
        --invite-helper: rgba(203, 213, 225, 0.85);
        --invite-placeholder: #94a3b8;
        --invite-button-bg: #f8fafc;
        --invite-button-hover: #e2e8f0;
        --invite-button-text: #05070f;
        --invite-input-bg: rgba(12, 18, 30, 0.75);
        --invite-input-border: rgba(148, 163, 184, 0.45);
        --invite-input-text: #f8fafc;
        --invite-alert-success-bg: rgba(34, 197, 94, 0.22);
        --invite-alert-success-border: rgba(52, 211, 153, 0.4);
        --invite-alert-success-text: #bbf7d0;
        --invite-alert-error-bg: rgba(248, 113, 113, 0.24);
        --invite-alert-error-border: rgba(248, 113, 113, 0.45);
        --invite-alert-error-text: #fee2e2;
        --invite-alert-info-bg: rgba(148, 163, 184, 0.24);
        --invite-alert-info-border: rgba(165, 180, 252, 0.38);
        --invite-alert-info-text: #e2e8f0;
        --invite-divider: rgba(148, 163, 184, 0.35);
        --invite-summary: rgba(239, 245, 253, 0.92);
      }
    }

    body[data-theme="dark"] {
      color-scheme: dark;
      --invite-bg: #05070f;
      --invite-surface: rgba(8, 12, 20, 0.96);
      --invite-surface-muted: rgba(255, 255, 255, 0.08);
      --invite-border: rgba(148, 163, 184, 0.35);
      --invite-heading: #f8fafc;
      --invite-text: rgba(239, 245, 253, 0.92);
      --invite-muted: #94a3b8;
      --invite-helper: rgba(203, 213, 225, 0.85);
      --invite-placeholder: #94a3b8;
      --invite-button-bg: #f8fafc;
      --invite-button-hover: #e2e8f0;
      --invite-button-text: #05070f;
      --invite-input-bg: rgba(12, 18, 30, 0.75);
      --invite-input-border: rgba(148, 163, 184, 0.45);
      --invite-input-text: #f8fafc;
      --invite-alert-success-bg: rgba(34, 197, 94, 0.22);
      --invite-alert-success-border: rgba(52, 211, 153, 0.4);
      --invite-alert-success-text: #bbf7d0;
      --invite-alert-error-bg: rgba(248, 113, 113, 0.24);
      --invite-alert-error-border: rgba(248, 113, 113, 0.45);
      --invite-alert-error-text: #fee2e2;
      --invite-alert-info-bg: rgba(148, 163, 184, 0.24);
      --invite-alert-info-border: rgba(165, 180, 252, 0.38);
      --invite-alert-info-text: #e2e8f0;
      --invite-divider: rgba(148, 163, 184, 0.35);
      --invite-summary: rgba(239, 245, 253, 0.92);
    }

    body[data-theme="light"] {
      color-scheme: light;
    }

    body[data-theme="dark"] .theme-toggle {
      color: var(--invite-muted);
    }

    body[data-theme="dark"] .theme-toggle:hover {
      color: var(--invite-heading);
    }

    body[data-theme="dark"] .theme-icon-sun {
      display: none;
    }

    body[data-theme="dark"] .theme-icon-moon {
      display: inline-flex;
    }

    body[data-theme="light"] .theme-icon-sun,
    body:not([data-theme]) .theme-icon-sun {
      display: inline-flex;
    }

    body[data-theme="light"] .theme-icon-moon,
    body:not([data-theme]) .theme-icon-moon {
      display: none;
    }
  </style>`;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  try {
    const clonedForSize = await request.clone().text();
    const inviteBytes = new TextEncoder().encode(clonedForSize).length;
    if (inviteBytes > 16384) {
      throw new PayloadTooLargeError(inviteBytes, 16384);
    }

    // Parse request body
    const formData = await request.formData();
    const email = formData.get('email')?.toString()?.toLowerCase().trim();
    const turnstileToken = formData.get('cf-turnstile-response')?.toString();
    const nonce = ((context.data as any) && (context.data as any).nonce) as string | undefined;

    // Get tracking token from URL if present
    const url = new URL(request.url);
    const trackingToken = url.searchParams.get('t');

    if (!email) {
      return new Response(
        renderInvitePage(env, nonce, { error: 'Please enter a valid email address.' }),
        { status: 400, headers: { 'Content-Type': 'text/html' } }
      ) as unknown as CfResponse;
    }

    if (!turnstileToken) {
      return new Response(
        renderInvitePage(env, nonce, {
          error: 'Please complete the security check.',
          emailValue: email
        }),
        { status: 400, headers: { 'Content-Type': 'text/html' } }
      ) as unknown as CfResponse;
    }

    // Get client IP for rate limiting and logging
    const clientIp = request.headers.get('CF-Connecting-IP') ||
                     request.headers.get('X-Forwarded-For') ||
                     'unknown';

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        renderInvitePage(env, nonce, { error: 'That email doesn\'t look right. Please check and try again.', emailValue: email }),
        { status: 400, headers: { 'Content-Type': 'text/html' } }
      ) as unknown as CfResponse;
    }

    // Verify Turnstile token
    const turnstileValid = await verifyTurnstile(turnstileToken, env.TURNSTILE_SECRET_KEY, clientIp);
    if (!turnstileValid) {
      return new Response(
        renderInvitePage(env, nonce, {
          error: 'Security check failed. Please try again.',
          emailValue: email
        }),
        { status: 400, headers: { 'Content-Type': 'text/html' } }
      ) as unknown as CfResponse;
    }

    // Check IP-based rate limit
    const invitesPerMin = Number.parseInt(env.INVITES_PER_IP_PER_10MIN || '5', 10);
    const ipLimitOk = await checkRateLimit(env, `ip:invite:${clientIp}`, invitesPerMin, 600);
    if (!ipLimitOk) {
      return new Response(
        renderInvitePage(env, nonce, { error: 'Too many requests from your network. Please try again in a little while.', emailValue: email }),
        { status: 429, headers: { 'Content-Type': 'text/html' } }
      ) as unknown as CfResponse;
    }

    const emailHash = await hashEmail(email, env.KEK_B64);

    // Email-based rate limit (generic success to prevent enumeration)
    const invitesPerHour = Number.parseInt(env.INVITES_PER_EMAIL_PER_HOUR || '3', 10);
    const emailLimitOk = await checkRateLimit(env, `email:invite:${emailHash}`, invitesPerHour, 3600);
    if (!emailLimitOk) {
      return new Response(
        renderInvitePage(env, nonce, { success: 'Perfect! Check your email now for a single use access link. It will arrive within a minute.' }),
        { status: 200, headers: { 'Content-Type': 'text/html' } }
      ) as unknown as CfResponse;
    }

    // Check if guest exists (REQUIRED - no more auto-creation)
    const existingGuest = await env.DB.prepare(
      'SELECT id, invite_clicked_at FROM guests WHERE email_hash = ?'
    ).bind(emailHash).first();

    if (!existingGuest) {
      // Guest not in database - they haven't been invited
      // Return generic success to prevent enumeration
      return new Response(
        renderInvitePage(env, nonce, { success: 'Perfect! Check your email now for a single use access link. It will arrive within a minute.' }),
        { status: 200, headers: { 'Content-Type': 'text/html' } }
      ) as unknown as CfResponse;
    }

    const guestId = (existingGuest as any).id as number;

    // If tracking token was provided, record the click
    if (trackingToken && !(existingGuest as any).invite_clicked_at) {
      const tokenHash = await hashToken(trackingToken, env.KEK_B64);
      const validToken = await env.DB.prepare(
        'SELECT 1 FROM guests WHERE id = ? AND invite_token_hash = ?'
      ).bind(guestId, tokenHash).first();

      if (validToken) {
        const now = Math.floor(Date.now() / 1000);
        await env.DB.prepare(
          'UPDATE guests SET invite_clicked_at = ? WHERE id = ?'
        ).bind(now, guestId).run();

        // Log audit event for tracking
        await env.DB.prepare(
          'INSERT INTO audit_events (guest_id, type, created_at) VALUES (?, ?, ?)'
        ).bind(guestId, 'invite_clicked', now).run();
      }
    }

    // Mark as registered if not already
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      'UPDATE guests SET registered_at = ? WHERE id = ? AND registered_at IS NULL'
    ).bind(now, guestId).run();

    // Generate new magic link token
    const token = generateToken();
    const tokenHash = await hashToken(token, env.KEK_B64);

    // Store magic link in database
    const ttlMin = Number.parseInt(env.MAGIC_LINK_TTL_MIN || '10', 10);
    const expiresAt = now + (ttlMin * 60);

    await env.DB.prepare(
      `INSERT INTO magic_links (guest_id, token_hash, issued_at, expires_at, issued_ip_hash, issued_ua)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(
      guestId,
      tokenHash,
      now,
      expiresAt,
      await hashEmail(clientIp, env.KEK_B64),
      request.headers.get('User-Agent')?.substring(0, 200) || ''
    ).run();

    // Log audit event
    await env.DB.prepare(
      'INSERT INTO audit_events (guest_id, type, created_at) VALUES (?, ?, ?)'
    ).bind(guestId, 'email_sent', now).run();

    // Send email
    let magicLinkSubject: string | undefined;
    const eventRow = await env.DB.prepare(
      'SELECT enc_details FROM event WHERE id = 1'
    ).first();

    if (eventRow && eventRow.enc_details) {
      try {
        const eventDetails = await decryptJson(
          eventRow.enc_details as string,
          env.KEK_B64,
          'event',
          '1',
          'details'
        ) as EventDetails;
        magicLinkSubject = eventDetails.magicLinkEmailSubject?.trim() || undefined;
      } catch (subjectError) {
        logError('invite/post/subject', subjectError);
      }
    }

    const magicLink = `${env.APP_BASE_URL}/auth/verify?token=${token}`;
    try {
      await sendMagicLinkEmail(env, email, magicLink, magicLinkSubject);
    } catch (emailError) {
      logError('invite/post/email', emailError);
    }

    // Success response - always generic to prevent enumeration
    return new Response(
      renderInvitePage(env, nonce, {
        success: 'Perfect! Check your email now for a single use access link. It will arrive within a minute.'
      }),
      { status: 200, headers: { 'Content-Type': 'text/html' } }
    ) as unknown as CfResponse;

  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return new Response('Payload too large', { status: 413 }) as unknown as CfResponse;
    }
    logError('invite/post', error);
    const nonce = ((context.data as any) && (context.data as any).nonce) as string | undefined;
    return new Response(
      renderInvitePage(env, nonce, { error: 'An error occurred. Please try again.' }),
      { status: 500, headers: { 'Content-Type': 'text/html' } }
    ) as unknown as CfResponse;
  }
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, request } = context;
  const nonce = ((context.data as any) && (context.data as any).nonce) as string | undefined;

  // Check for tracking token in URL
  const url = new URL(request.url);
  const trackingToken = url.searchParams.get('t');

  if (trackingToken) {
    // If tracking token present, record the click
    try {
      const tokenHash = await hashToken(trackingToken, env.KEK_B64);
      const guest = await env.DB.prepare(
        'SELECT id, invite_clicked_at FROM guests WHERE invite_token_hash = ?'
      ).bind(tokenHash).first();

      if (guest && !(guest as any).invite_clicked_at) {
        const now = Math.floor(Date.now() / 1000);
        await env.DB.prepare(
          'UPDATE guests SET invite_clicked_at = ? WHERE id = ?'
        ).bind(now, (guest as any).id).run();

        // Log audit event
        await env.DB.prepare(
          'INSERT INTO audit_events (guest_id, type, created_at) VALUES (?, ?, ?)'
        ).bind((guest as any).id, 'invite_clicked', now).run();
      }
    } catch (error) {
      logError('invite/track', error);
    }
  }

  return new Response(
    renderInvitePage(env, nonce),
    {
      status: 200,
      headers: {
        'Content-Type': 'text/html',
        'Cache-Control': 'no-store'
      }
    }
  ) as unknown as CfResponse;
};
