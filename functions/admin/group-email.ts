import type { PagesFunction, Response as CfResponse } from '@cloudflare/workers-types';
import { decryptJson } from '../../src/lib/crypto';
import { sendGroupEmail } from '../../src/lib/gmail';
import { logError } from '../../src/lib/logger';
import { requireAccessAssertion } from '../../src/lib/access';
import type { Env, GuestProfile } from '../../src/types';

interface GroupEmailRequestBody {
  subject?: unknown;
  body?: unknown;
  recipientMode?: unknown;
  recipientEventFilter?: unknown;
  recipientStatusFilter?: unknown;
  recipientCustomIds?: unknown;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  // Check admin auth
  const authResult = await requireAccessAssertion(request, env);
  if (authResult instanceof Response) {
    return authResult as unknown as CfResponse;
  }

  try {
    const data = await request.json() as GroupEmailRequestBody;

    // Parse input
    const subject = typeof data.subject === 'string' ? data.subject.trim() : '';
    const body = typeof data.body === 'string' ? data.body.trim() : '';
    const mode = data.recipientMode === 'filter' || data.recipientMode === 'custom'
      ? data.recipientMode
      : null;

    if (!subject || !body || !mode) {
      return new Response('Missing required fields', { status: 400 }) as unknown as CfResponse;
    }

    let emails: string[] = [];

    // Custom mode: get emails from guest IDs
    if (mode === 'custom') {
      const ids = Array.isArray(data.recipientCustomIds)
        ? data.recipientCustomIds.filter(id => typeof id === 'number')
        : [];

      if (ids.length === 0) {
        return new Response('No recipients selected', { status: 400 }) as unknown as CfResponse;
      }

      // D1 has a limit of 100 bound parameters per query, so batch IDs
      const D1_PARAM_LIMIT = 99;
      for (let i = 0; i < ids.length; i += D1_PARAM_LIMIT) {
        const chunk = ids.slice(i, i + D1_PARAM_LIMIT);
        const placeholders = chunk.map(() => '?').join(',');
        const rows = await env.DB.prepare(
          `SELECT email_hash, enc_profile FROM guests WHERE id IN (${placeholders})`
        ).bind(...chunk).all();

        for (const row of rows.results) {
          const profile = await decryptJson(
            row.enc_profile as string,
            env.KEK_B64,
            'guests',
            row.email_hash as string,
            'profile'
          ) as GuestProfile;

          if (profile.email?.trim()) {
            emails.push(profile.email.trim().toLowerCase());
          }
        }
      }
    }

    // Filter mode: apply EXACT same logic as frontend calculateRecipientStats
    if (mode === 'filter') {
      const eventFilter = typeof data.recipientEventFilter === 'string'
        ? data.recipientEventFilter
        : '';
      const statusFilter = typeof data.recipientStatusFilter === 'string'
        ? data.recipientStatusFilter
        : '';

      if (!eventFilter || !statusFilter) {
        return new Response('Both filters must be selected', { status: 400 }) as unknown as CfResponse;
      }

      const allRows = await env.DB.prepare(
        'SELECT email_hash, enc_profile FROM guests'
      ).all();

      // Helper function (matches frontend line 200)
      const getAttendanceStatus = (record: { status?: 'yes' | 'no' | 'pending' } | undefined): 'yes' | 'no' | 'pending' => {
        return record?.status ?? 'pending';
      };

      for (const row of allRows.results) {
        const profile = await decryptJson(
          row.enc_profile as string,
          env.KEK_B64,
          'guests',
          row.email_hash as string,
          'profile'
        ) as GuestProfile;

        // Must have email
        if (!profile.email?.trim()) {
          continue;
        }

        // Event filter
        if (eventFilter !== 'all') {
          const hasInvitedMember = profile.party.some(member =>
            member.invitedEvents.includes(eventFilter)
          );
          if (!hasInvitedMember) {
            continue;
          }
        }

        // Status filter
        if (statusFilter !== 'all') {
          if (statusFilter === 'has-email') {
            // Already checked email above
            emails.push(profile.email.trim().toLowerCase());
            continue;
          }

          if (eventFilter === 'all') {
            // Can't filter by status without specific event
            emails.push(profile.email.trim().toLowerCase());
            continue;
          }

          // Check party member attendance for this event
          const statuses: Array<'yes' | 'no' | 'pending'> = [];
          profile.party.forEach(member => {
            if (member.invitedEvents.includes(eventFilter)) {
              statuses.push(getAttendanceStatus(member.attendance?.[eventFilter]));
            }
          });

          if (statuses.length === 0) {
            // No members invited to this event
            continue;
          }

          // Match the filter (exact logic from frontend lines 2049-2060)
          let matches = false;
          if (statusFilter === 'accepted') {
            matches = statuses.some(s => s === 'yes');
          } else if (statusFilter === 'pending') {
            matches = statuses.some(s => s === 'pending');
          } else if (statusFilter === 'declined') {
            matches = statuses.every(s => s === 'no');
          } else if (statusFilter === 'invited') {
            matches = statuses.some(s => s === 'yes' || s === 'pending');
          }

          if (matches) {
            emails.push(profile.email.trim().toLowerCase());
          }
        } else {
          // No status filter, just add
          emails.push(profile.email.trim().toLowerCase());
        }
      }
    }

    if (emails.length === 0) {
      return new Response('No recipients found', { status: 400 }) as unknown as CfResponse;
    }

    // Send individual email to each recipient
    // Gmail API limit: 150 emails/minute (2.5/sec), use 500ms delay to stay under
    let sentCount = 0;
    let failedCount = 0;

    for (let i = 0; i < emails.length; i++) {
      try {
        await sendGroupEmail(env, emails[i], subject, body);
        sentCount++;
      } catch (error) {
        // Log error but continue sending to others
        // NO PII: Don't log email address, just the error
        logError('admin/group-email/send-failed', error);
        failedCount++;
      }

      // Add 500ms delay between sends (except after last email)
      if (i < emails.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // Log to audit (only if at least one email sent successfully)
    if (sentCount > 0) {
      const now = Math.floor(Date.now() / 1000);
      await env.DB.prepare(
        'INSERT INTO audit_events (guest_id, type, created_at) VALUES (?, ?, ?)'
      ).bind(null, 'group_email_sent', now).run();
    }

    // Return response based on success/failure counts
    if (failedCount === 0) {
      // All emails sent successfully
      return new Response(JSON.stringify({
        success: true,
        emailsSent: sentCount
      }), {
        headers: { 'Content-Type': 'application/json' }
      }) as unknown as CfResponse;
    } else if (sentCount > 0) {
      // Partial success
      return new Response(JSON.stringify({
        success: true,
        emailsSent: sentCount,
        failed: failedCount
      }), {
        status: 207,  // Multi-Status
        headers: { 'Content-Type': 'application/json' }
      }) as unknown as CfResponse;
    } else {
      // All failed
      return new Response(JSON.stringify({
        error: 'All emails failed to send'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }) as unknown as CfResponse;
    }

  } catch (error) {
    logError('admin/group-email/post', error);
    return new Response(JSON.stringify({
      error: 'Failed to send email'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }) as unknown as CfResponse;
  }
};
