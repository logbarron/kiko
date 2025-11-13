import type { Env, PartyMember } from '../types';
import { INVITE_HEADER_IMAGE, MAGIC_HEADER_IMAGE } from './emailAssets';
import { BRAND_SANS } from './pageStyles';
import { logError } from './logger';
import { formatMemberNameWithInitial } from './name-format';

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface InlineImageAttachment {
  readonly mimeType: string;
  readonly base64: string;
  readonly fileName: string;
  readonly contentId: string;
}

interface RenderedEmail {
  readonly html: string;
  readonly text: string;
}

interface GmailSendPayload {
  env: Env;
  to: string;
  subject: string;
  html: string;
  text: string;
  inlineImages?: InlineImageAttachment[];
}

async function getAccessToken(env: Env): Promise<string> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: env.GMAIL_CLIENT_ID,
      client_secret: env.GMAIL_CLIENT_SECRET,
      refresh_token: env.GMAIL_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to refresh token: ${response.status}`);
  }

  const data: TokenResponse = await response.json();
  return data.access_token;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderEmailShell({
  preheader = '',
  content,
}: {
  preheader?: string;
  content: string;
}): string {
  const trimmedContent = content.trim();
  const hiddenPreheader = preheader
    ? `<div style="display:none;font-size:1px;color:#fafafa;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(preheader)}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body style="margin:0;padding:0;background-color:#fafafa;">
    ${hiddenPreheader}
    ${trimmedContent}
  </body>
</html>`.trim();
}

function renderPrimaryButton(text: string, href: string): string {
  const safeText = escapeHtml(text);
  const safeHref = escapeHtml(href);

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;border-collapse:separate;">
      <tr>
        <td align="center" style="border-radius:999px;background:linear-gradient(135deg,#0f766e 0%,#14b8a6 100%);">
          <a href="${safeHref}" style="display:inline-block;padding:16px 36px;font-family:${BRAND_SANS};font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px;letter-spacing:0.02em;">
            ${safeText}
          </a>
        </td>
      </tr>
    </table>
  `.trim();
}

function generateMimeBoundary(): string {
  return `----=_Part_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;
}

function chunkBase64(base64: string): string {
  return base64.match(/.{1,76}/g)?.join('\r\n') ?? base64;
}

const entityMap: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
};

function htmlToPlainText(html: string): string {
  return html
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_match, href, text) => {
      const cleanedText = text.replace(/<[^>]+>/g, '').trim();
      const cleanedHref = href.trim();
      return cleanedText ? `${cleanedText} (${cleanedHref})` : cleanedHref;
    })
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_match, item) => {
      const cleanedItem = item.replace(/<[^>]+>/g, '').trim();
      return cleanedItem ? `• ${cleanedItem}\n` : '';
    })
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(p|div)>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCharCode(Number(dec)))
    .replace(/&([^;\s]+);/g, (_m, entity) => {
      const mapped = entityMap[entity.toLowerCase()];
      return mapped !== undefined ? mapped : `&${entity};`;
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function buildMimeMessage({
  from,
  to,
  subject,
  html,
  text,
  inlineImages = [],
}: {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  inlineImages?: InlineImageAttachment[];
}): string {
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
  ];

  if (!inlineImages.length) {
    const alternativeBoundary = generateMimeBoundary();
    return [
      ...headers,
      `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
      '',
      `--${alternativeBoundary}`,
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: 7bit',
      '',
      text,
      '',
      `--${alternativeBoundary}`,
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: 7bit',
      '',
      html,
      '',
      `--${alternativeBoundary}--`,
      '',
    ].join('\r\n');
  }

  const relatedBoundary = generateMimeBoundary();
  const alternativeBoundary = generateMimeBoundary();
  const lines = [
    ...headers,
    `Content-Type: multipart/related; boundary="${relatedBoundary}"`,
    '',
    `--${relatedBoundary}`,
    `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
    '',
    `--${alternativeBoundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    text,
    '',
    `--${alternativeBoundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    html,
    '',
    `--${alternativeBoundary}--`,
    '',
  ];

  for (const image of inlineImages) {
    lines.push(`--${relatedBoundary}`);
    lines.push(`Content-Type: ${image.mimeType}`);
    lines.push('Content-Transfer-Encoding: base64');
    lines.push(`Content-ID: <${image.contentId}>`);
    lines.push(`Content-Disposition: inline; filename="${image.fileName}"`);
    lines.push('');
    lines.push(chunkBase64(image.base64));
    lines.push('');
  }

  lines.push(`--${relatedBoundary}--`);
  lines.push('');

  return lines.join('\r\n');
}

function renderGroupEmail(bodyContent: string): RenderedEmail {
  const headerRow = `<tr>
          <td style="padding:0;">
            <img src="cid:${MAGIC_HEADER_IMAGE.contentId}" alt="Tropical watercolor foliage" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;border-radius:24px 24px 0 0;" />
          </td>
        </tr>`;
  const content = `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;background-color:#fafafa;width:100%;">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;width:100%;border-collapse:collapse;">
            ${headerRow}
            <tr>
              <td style="background-color:#ffffff;border:1px solid #d9f3ef;border-top:none;border-radius:0 0 24px 24px;box-shadow:0 16px 32px rgba(15,118,110,0.06);">
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
                  <tr>
                    <td style="padding:32px 28px;">
                      <div style="font-family:${BRAND_SANS};font-size:16px;line-height:1.7;color:#334155;">
                        ${bodyContent}
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;

  const html = renderEmailShell({
    preheader: '',
    content,
  });
  const text = htmlToPlainText(html);

  return { html, text };
}

function renderMagicLinkEmail(magicLink: string): RenderedEmail {
  const headerRow = `<tr>
          <td style="padding:0;">
            <img src="cid:${MAGIC_HEADER_IMAGE.contentId}" alt="Tropical watercolor foliage" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;border-radius:24px 24px 0 0;" />
          </td>
        </tr>`;
  const content = `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;background-color:#fafafa;width:100%;">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;width:100%;border-collapse:collapse;">
            ${headerRow}
            <tr>
              <td style="background-color:#ffffff;border:1px solid #d9f3ef;border-top:none;border-radius:0 0 24px 24px;box-shadow:0 16px 32px rgba(15,118,110,0.06);">
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
                  <tr>
                    <td align="center" style="padding:32px 28px 20px 28px;">
                      <div style="font-family:${BRAND_SANS};font-size:24px;line-height:1.3;color:#0f172a;letter-spacing:0.02em;">Let's get you signed in</div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 28px 28px 28px;">
                      <p style="margin:0;font-family:${BRAND_SANS};font-size:15px;line-height:1.6;color:#334155;text-align:center;">Sign in with the secure link below</p>
                    </td>
                  </tr>
                  <tr>
                    <td align="center" style="padding:0 28px 28px 28px;">
                      ${renderPrimaryButton('Access RSVP & Event Details', magicLink)}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 28px 20px 28px;">
                      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
                        <tr>
                  <td style="background-color:#ecfeff;border:1px solid #bae6fd;border-radius:12px;padding:14px 16px;text-align:center;font-family:${BRAND_SANS};font-size:14px;line-height:1.6;color:#0f172a;"><strong>Important:</strong> This link expires in 10 minutes and can only be used once.</td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 28px 36px 28px;">
                      <p style="margin:0;font-family:${BRAND_SANS};font-size:14px;line-height:1.6;color:#6b7280;text-align:center;">If you didn't request this, please ignore this email.</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;

  const html = renderEmailShell({
    preheader: 'Click the secure link below to view event details and RSVP.',
    content,
  });
  const text = htmlToPlainText(html);

  return { html, text };
}

export async function sendGmailMessage({ env, to, subject, html, text, inlineImages }: GmailSendPayload): Promise<void> {
  const accessToken = await getAccessToken(env);

  const message = buildMimeMessage({
    from: env.GMAIL_FROM,
    to,
    subject,
    html,
    text,
    inlineImages,
  });

  const encodedMessage = btoa(message)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: encodedMessage }),
  });

  if (!response.ok) {
    throw new Error(`Failed to send email: ${response.status}`);
  }
}

export function buildInviteGreeting(party: PartyMember[]): string {
  const primary = party.find(member => member.role === 'primary');
  const primaryGreeting = formatMemberNameWithInitial(primary) ?? 'Guest';

  const companion = party.find(member => member.role === 'companion');
  const companionGreeting = formatMemberNameWithInitial(companion);
  if (companionGreeting) {
    return `${primaryGreeting} & ${companionGreeting}`;
  }

  const guest = party.find(member => member.role === 'guest');
  if (guest) {
    return `${primaryGreeting} & Guest`;
  }

  return primaryGreeting;
}

function renderWeddingInvitationEmail(
  party: PartyMember[],
  trackingUrl: string
): RenderedEmail {
  const greeting = buildInviteGreeting(party);
  const safeGreeting = escapeHtml(greeting);
  const safeTrackingUrl = escapeHtml(trackingUrl);
  const headerRow = `<tr>
          <td style="padding:0;">
            <img src="cid:${INVITE_HEADER_IMAGE.contentId}" alt="Watercolor wedding florals" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;border-radius:28px 28px 0 0;" />
          </td>
        </tr>`;
  const content = `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;background-color:#fafafa;width:100%;">
      <tr>
        <td align="center" style="padding:48px 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;width:100%;border-collapse:collapse;">
            ${headerRow}
            <tr>
              <td style="background-color:#ffffff;border:1px solid #f2e8d5;border-top:none;border-radius:0 0 28px 28px;box-shadow:0 20px 38px rgba(15,118,110,0.08);">
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
                  <tr>
                    <td align="center" style="padding:40px 32px 24px 32px;">
                      <div style="font-family:${BRAND_SANS};font-size:32px;line-height:1.3;color:#0f172a;letter-spacing:0.02em;">You're Invited!</div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 32px;">
                      <p style="margin:0 0 20px 0;font-family:${BRAND_SANS};font-size:16px;line-height:1.6;color:#334155;">Dear ${safeGreeting},</p>
                      <p style="margin:0 0 32px 0;font-family:${BRAND_SANS};font-size:16px;line-height:1.6;color:#334155;">We would be honored to have you join us for our wedding celebration.</p>
                    </td>
                  </tr>
                  <tr>
                    <td align="center" style="padding:0 32px 32px 32px;">
                      ${renderPrimaryButton('View Invitation & RSVP', trackingUrl)}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 32px 12px 32px;">
                      <p style="margin:0;font-family:${BRAND_SANS};font-size:14px;line-height:1.6;color:#64748b;">If the button doesn't work, copy and paste this link into your browser:</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 32px 40px 32px;word-break:break-word;">
                      <a href="${safeTrackingUrl}" style="font-family:${BRAND_SANS};font-size:14px;color:#0f766e;text-decoration:none;">${safeTrackingUrl}</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding-top:20px;">
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
                  <tr>
                    <td style="background-color:#f7f0e8;border-radius:16px;padding:18px 24px;text-align:center;font-family:${BRAND_SANS};font-size:12px;line-height:1.6;color:#6b7280;">This invitation is unique to you. Please do not share this link.</td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;

  const html = renderEmailShell({
    preheader: 'We would be honored to have you join us for our wedding celebration.',
    content,
  });
  const text = htmlToPlainText(html)
    .replace(`Dear ${safeGreeting}`, `Dear ${greeting}`)
    .replace(safeTrackingUrl, trackingUrl);

  return { html, text };
}

export async function sendMagicLinkEmail(
  env: Env,
  to: string,
  magicLink: string,
  subjectOverride?: string
): Promise<void> {
  try {
    const { html, text } = renderMagicLinkEmail(magicLink);
    const subject = subjectOverride?.trim() || 'TODO: Set your magic link email subject in admin panel';
    await sendGmailMessage({
      env,
      to,
      subject,
      html,
      text,
      inlineImages: [MAGIC_HEADER_IMAGE],
    });
  } catch (error) {
    logError('gmail/send-magic-link', error);
    throw error;
  }
}

export async function sendWeddingInvitation(
  env: Env,
  to: string,
  party: PartyMember[],
  trackingUrl: string,
  subjectOverride?: string
): Promise<void> {
  try {
    const { html, text } = renderWeddingInvitationEmail(party, trackingUrl);
    const subject = subjectOverride?.trim() || "TODO: Set your invitation email subject in admin panel";
    await sendGmailMessage({
      env,
      to,
      subject,
      html,
      text,
      inlineImages: [INVITE_HEADER_IMAGE],
    });
  } catch (error) {
    logError('gmail/send-wedding-invitation', error);
    throw error;
  }
}

export async function sendGroupEmail(
  env: Env,
  to: string,
  subject: string,
  body: string
): Promise<void> {
  try {
    // Convert plain text to HTML paragraphs
    const bodyHtml = body
      .split('\n\n')
      .filter(para => para.trim())
      .map(para => `<p style="margin:0 0 16px 0;">${escapeHtml(para.trim()).replace(/\n/g, '<br>')}</p>`)
      .join('');

    const { html, text } = renderGroupEmail(bodyHtml);
    await sendGmailMessage({
      env,
      to,
      subject,
      html,
      text,
      inlineImages: [MAGIC_HEADER_IMAGE],
    });
  } catch (error) {
    logError('gmail/send-group-email', error);
    throw error;
  }
}
