import type { PagesFunction, Response as CfResponse } from '@cloudflare/workers-types';
import { encryptJson, decryptJson, hashEmail, generateToken, hashToken } from '../../src/lib/crypto';
import { sendWeddingInvitation } from '../../src/lib/gmail';
import { logError } from '../../src/lib/logger';
import { requireAccessAssertion } from '../../src/lib/access';
import type { Env, EventDetails, GuestProfile } from '../../src/types';
import {
  buildPartyMembers,
  normalizeEventSelection,
  trimToString
} from './profileUtils';
import { loadEventSummaries } from './loadEventSummaries';

interface InviteRequestBody {
  primaryGuest?: {
    firstName?: unknown;
    lastName?: unknown;
    email?: unknown;
  };
  companion?: {
    firstName?: unknown;
    lastName?: unknown;
  };
  allowPlusOne?: unknown;
  eventVisibility?: Record<string, unknown>;
  sendEmail?: unknown;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  const authResult = await requireAccessAssertion(request, env);
  if (authResult instanceof Response) {
    return authResult as unknown as CfResponse;
  }

  try {
    const data = await request.json() as InviteRequestBody;
    const { events } = await loadEventSummaries(env);

    const sendEmailFlag = data.sendEmail;
    const shouldSendEmail = typeof sendEmailFlag === 'boolean' ? sendEmailFlag : true;

    const primaryFirstName = trimToString(data.primaryGuest?.firstName);
    const primaryLastName = trimToString(data.primaryGuest?.lastName);
    const email = trimToString(data.primaryGuest?.email).toLowerCase();

    if (!primaryFirstName || !primaryLastName || !email) {
      return new Response('Missing required fields', { status: 400 }) as unknown as CfResponse;
    }

    const emailHash = await hashEmail(email, env.KEK_B64);
    const now = Math.floor(Date.now() / 1000);

    const companionFirst = trimToString(data.companion?.firstName);
    const companionLast = trimToString(data.companion?.lastName);
    const hasNamedCompanion = Boolean(companionFirst || companionLast);
    const allowGuest = !hasNamedCompanion && data.allowPlusOne === true;

    const invitedEvents = normalizeEventSelection(data.eventVisibility, events, { allowEmpty: true });
    const party = buildPartyMembers(
      { firstName: primaryFirstName, lastName: primaryLastName },
      hasNamedCompanion ? { firstName: companionFirst, lastName: companionLast } : undefined,
      allowGuest,
      invitedEvents
    );

    const existing = await env.DB.prepare(
      'SELECT id FROM guests WHERE email_hash = ?'
    ).bind(emailHash).first();

    if (existing) {
      return new Response(JSON.stringify({
        error: 'Guest already exists',
        details: 'Use the guest management panel to update or resend this invite.'
      }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' }
      }) as unknown as CfResponse;
    }

    const inviteToken = generateToken();
    const inviteTokenHash = await hashToken(inviteToken, env.KEK_B64);
    const profile: GuestProfile = {
      email,
      party,
      inviteToken
    };

    if (shouldSendEmail) {
      profile.inviteSentAt = now;
    }

    const encProfile = await encryptJson(
      profile,
      env.KEK_B64,
      'guests',
      emailHash,
      'profile'
    );

    const result = await env.DB.prepare(`
      INSERT INTO guests (email_hash, enc_profile, created_at, updated_at, invite_token_hash, invite_sent_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(emailHash, encProfile, now, now, inviteTokenHash, shouldSendEmail ? now : null).run();

    const guestId = result.meta.last_row_id as number;

    if (shouldSendEmail) {
      const trackingUrl = `${env.APP_BASE_URL}/invite?t=${inviteToken}`;

      let inviteEmailSubject: string | undefined;
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
          inviteEmailSubject = eventDetails.inviteEmailSubject?.trim() || undefined;
        } catch (subjectError) {
          logError('admin/invite/event-subject', subjectError);
        }
      }

      await sendWeddingInvitation(
        env,
        email,
        party,
        trackingUrl,
        inviteEmailSubject
      );

      await env.DB.prepare(
        'INSERT INTO audit_events (guest_id, type, created_at) VALUES (?, ?, ?)'
      ).bind(guestId, 'invite_sent', now).run();
    } else {
      await env.DB.prepare(
        'INSERT INTO audit_events (guest_id, type, created_at) VALUES (?, ?, ?)'
      ).bind(guestId, 'invite_seeded', now).run();
    }

    const message = shouldSendEmail
      ? 'Invitation sent successfully'
      : 'Guest added without sending email';

    return new Response(JSON.stringify({
      success: true,
      guestId,
      message
    }), {
      headers: { 'Content-Type': 'application/json' }
    }) as unknown as CfResponse;

  } catch (error) {
    logError('admin/invite/post', error);
    return new Response(JSON.stringify({
      error: 'Internal error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }) as unknown as CfResponse;
  }
};
