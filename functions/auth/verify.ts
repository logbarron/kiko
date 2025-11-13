import type { PagesFunction, Response as CfResponse } from '@cloudflare/workers-types';
import { hashToken } from '../../src/lib/crypto';
import { createSession } from '../../src/lib/cookies';
import { logError } from '../../src/lib/logger';
import { pageStyles, escapeHtml } from '../../src/lib/pageStyles';
import { renderThemeToggle, renderThemeScript } from '../../src/views/shared/themeToggle';
import { checkRateLimit } from '../../src/lib/ratelimit';
import type { Env } from '../../src/types';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const nonce = ((context.data as any) && (context.data as any).nonce) as string | undefined;
  
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get('token');
    
    if (!token) {
      return renderError('Invalid or expired link.', nonce);
    }

    const clientIp =
      request.headers.get('CF-Connecting-IP') ||
      request.headers.get('X-Forwarded-For') ||
      'unknown';

    const verifyPerIp = Number.parseInt(env.VERIFY_PER_IP_PER_10MIN || '15', 10);
    const verifyPerToken = Number.parseInt(env.VERIFY_PER_TOKEN_PER_10MIN || '5', 10);
    const ipAllowed = await checkRateLimit(env, `verify:ip:${clientIp}`, verifyPerIp, 600);
    if (!ipAllowed) {
      await logAuditEvent(env, null, 'verify_fail');
      return renderError('Invalid or expired link.', nonce, 429);
    }
    
    // Hash the token to find it in DB
    const tokenHash = await hashToken(token, env.KEK_B64);
    const tokenAllowed = await checkRateLimit(env, `verify:token:${tokenHash}`, verifyPerToken, 600);
    if (!tokenAllowed) {
      await logAuditEvent(env, null, 'verify_fail');
      return renderError('Invalid or expired link.', nonce, 429);
    }

    const now = Math.floor(Date.now() / 1000);
    
    // Find magic link by token hash
    const magicLink = await env.DB.prepare(
      `SELECT id, guest_id, expires_at, used_at 
       FROM magic_links 
       WHERE token_hash = ?`
    ).bind(tokenHash).first() as unknown as { id: number; guest_id: number; expires_at: number; used_at?: number } | null;
    
    // Record click event regardless of validity
    await logAuditEvent(env, magicLink ? (magicLink.guest_id as number) : null, 'link_clicked');

    // Validate magic link
    // Check validity
    if (!magicLink) {
      await logAuditEvent(env, null, 'verify_fail');
      return renderError('Invalid or expired link.', nonce);
    }
    
    if (magicLink.used_at) {
      await logAuditEvent(env, magicLink.guest_id as number, 'verify_fail');
      return renderError('This link has already been used.', nonce);
    }
    
    if (magicLink.expires_at < now) {
      await logAuditEvent(env, magicLink.guest_id as number, 'verify_fail');
      return renderError('This link has expired.', nonce);
    }
    
    // Mark as used (single-use enforcement)
    await env.DB.prepare(
      'UPDATE magic_links SET used_at = ? WHERE id = ?'
    ).bind(now, magicLink.id).run();
    
    // Create session
    const { cookie, sessionIdHash } = await createSession(
      magicLink.guest_id as number,
      env
    );
    
    // Store session in DB
    const sessionExpiry = now + (parseInt(env.SESSION_ABSOLUTE_HOURS) * 3600);
    await env.DB.prepare(
      `INSERT INTO sessions (guest_id, session_id_hash, created_at, expires_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(
      magicLink.guest_id,
      sessionIdHash,
      now,
      sessionExpiry,
      now
    ).run();
    
    // Log success
    await logAuditEvent(env, magicLink.guest_id as number, 'verify_ok');
    
    // Redirect to event page (removes token from URL)
    return new Response(null, {
      status: 302,
      headers: {
        'Location': '/event',
        'Set-Cookie': cookie,
        'Cache-Control': 'no-store'
      }
    }) as unknown as CfResponse;
    
  } catch (error) {
    logError('auth/verify', error);
    return renderError('An error occurred. Please request a new link.', nonce);
  }
};

function renderError(message: string, nonce?: string, status: number = 400): CfResponse {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Access Error - Wedding Invitation</title>
    ${pageStyles.getBaseStyles(nonce)}
    ${renderVerifyThemeStyles(nonce)}
    <meta name="robots" content="noindex,nofollow">
    <meta name="referrer" content="no-referrer">
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">
    <meta name="color-scheme" content="light dark">
    <meta name="theme-color" content="#fafafa" media="(prefers-color-scheme: light)">
    <meta name="theme-color" content="#05070f" media="(prefers-color-scheme: dark)">
</head>
<body>
    <div class="container" data-verify-container>
        <div class="theme-toggle-slot">
          ${renderThemeToggle()}
        </div>
        <h1 data-verify-heading>Link Not Valid</h1>
        <p data-verify-message>${escapeHtml(message)}</p>
        <a href="/invite" class="btn-primary" data-verify-link>Request New Link</a>
        <p class="helper-text" style="margin-top: 24px;" data-verify-helper>
          Links are single-use and expire quickly for security.
        </p>
    </div>
    ${renderThemeScript(nonce, { storageKey: 'guest-theme' })}
</body>
</html>`;
  
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html' }
  }) as unknown as CfResponse;
}

async function logAuditEvent(env: Env, guestId: number | null, type: string): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO audit_events (guest_id, type, created_at) VALUES (?, ?, ?)'
  ).bind(guestId, type, Math.floor(Date.now() / 1000)).run();
}

function renderVerifyThemeStyles(nonce: string | undefined): string {
  return `<style${nonce ? ` nonce="${nonce}"` : ''}>
    body {
      --verify-bg: #fafafa;
      --verify-surface: #ffffff;
      --verify-border: #e5e7eb;
      --verify-heading: #0f172a;
      --verify-text: #334155;
      --verify-muted: #64748b;
      --verify-button-bg: #111827;
      --verify-button-hover: #1f2937;
      --verify-button-text: #f8fafc;
      --verify-link-bg: #111827;
      --verify-link-hover: #1f2937;
      --verify-link-text: #f8fafc;
    }

    body {
      background: var(--verify-bg);
      color: var(--verify-text);
      transition: background 0.3s ease, color 0.3s ease;
    }

    [data-verify-container] {
      background: var(--verify-surface);
      border-color: var(--verify-border);
      transition: background 0.3s ease, border-color 0.3s ease, color 0.3s ease;
    }

    [data-verify-heading] {
      color: var(--verify-heading);
    }

    [data-verify-message],
    [data-verify-helper] {
      color: var(--verify-text);
    }

    .text-muted,
    .helper-text {
      color: var(--verify-muted);
    }

    [data-verify-link] {
      background: var(--verify-link-bg);
      color: var(--verify-link-text);
      display: inline-block;
      margin-top: 24px;
      transition: background 0.2s ease, transform 0.2s ease;
    }

    [data-verify-link]:hover {
      background: var(--verify-link-hover);
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
      color: var(--verify-muted);
      cursor: pointer;
      border-radius: 999px;
      transition: color 0.2s ease, box-shadow 0.2s ease;
    }

    .theme-toggle:hover {
      color: var(--verify-heading);
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

    @media (prefers-color-scheme: dark) {
      body:not([data-theme]) {
        color-scheme: dark;
        --verify-bg: #05070f;
        --verify-surface: rgba(8, 12, 20, 0.96);
        --verify-border: rgba(148, 163, 184, 0.35);
        --verify-heading: #f8fafc;
        --verify-text: rgba(239, 245, 253, 0.92);
        --verify-muted: rgba(156, 172, 191, 0.85);
        --verify-link-bg: #f8fafc;
        --verify-link-hover: #e2e8f0;
        --verify-link-text: #05070f;
      }
    }

    body[data-theme="dark"] {
      color-scheme: dark;
      --verify-bg: #05070f;
      --verify-surface: rgba(8, 12, 20, 0.96);
      --verify-border: rgba(148, 163, 184, 0.35);
      --verify-heading: #f8fafc;
      --verify-text: rgba(239, 245, 253, 0.92);
      --verify-muted: rgba(156, 172, 191, 0.85);
      --verify-link-bg: #f8fafc;
      --verify-link-hover: #e2e8f0;
      --verify-link-text: #05070f;
    }

    body[data-theme="dark"] .theme-toggle {
      color: rgba(148, 163, 184, 0.85);
    }

    body[data-theme="dark"] .theme-toggle:hover {
      color: #f8fafc;
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

    @media (max-width: 540px) {
      .theme-toggle-slot {
        top: 12px;
        right: 12px;
      }
    }
  </style>`;
}
