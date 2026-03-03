import type { PagesFunction, Response as CfResponse } from '@cloudflare/workers-types';
import { decryptJson } from '../../src/lib/crypto';
import { sendGroupEmail } from '../../src/lib/gmail';
import { logError } from '../../src/lib/logger';
import { requireAccessAssertion } from '../../src/lib/access';
import type { Env, GuestProfile } from '../../src/types';
import { migrateProfile } from './profileUtils';
import { loadEventSummaries } from './loadEventSummaries';

// Cloudflare free plan allows 50 external subrequests per invocation.
// With token caching: 1 token + 1 JWKS + BATCH_SIZE sends = BATCH_SIZE + 2.
// 24 + 2 = 26, safely under the 50 limit.
const BATCH_SIZE = 24;

interface GroupEmailRequestBody {
  subject?: unknown;
  body?: unknown;
  recipientMode?: unknown;
  recipientEventFilter?: unknown;
  recipientStatusFilter?: unknown;
  recipientCustomIds?: unknown;
  offset?: unknown;
  expectedTotal?: unknown;
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
    const offset = typeof data.offset === 'number' && data.offset >= 0
      ? Math.floor(data.offset)
      : 0;
    const expectedTotal = typeof data.expectedTotal === 'number' && Number.isFinite(data.expectedTotal) && data.expectedTotal >= 0
      ? Math.floor(data.expectedTotal)
      : null;

    if (!subject || !body || !mode) {
      return new Response('Missing required fields', { status: 400 }) as unknown as CfResponse;
    }

    const { events } = await loadEventSummaries(env);
    const emailSet = new Set<string>();

    const addRecipientEmail = (email: string | undefined) => {
      const normalized = email?.trim().toLowerCase();
      if (normalized) {
        emailSet.add(normalized);
      }
    };

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
          `SELECT email_hash, enc_profile FROM guests WHERE id IN (${placeholders}) ORDER BY email_hash`
        ).bind(...chunk).all();

        for (const row of rows.results) {
          try {
            const profile = migrateProfile(
              await decryptJson(
                row.enc_profile as string,
                env.KEK_B64,
                'guests',
                row.email_hash as string,
                'profile'
              ),
              events
            );
            addRecipientEmail(profile.email);
          } catch (error) {
            logError('admin/group-email/decrypt-failed', error);
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
        'SELECT email_hash, enc_profile FROM guests ORDER BY email_hash'
      ).all();

      // Helper function (matches frontend line 200)
      const getAttendanceStatus = (record: { status?: 'yes' | 'no' | 'pending' } | undefined): 'yes' | 'no' | 'pending' => {
        return record?.status ?? 'pending';
      };

      for (const row of allRows.results) {
        let profile: GuestProfile;
        try {
          profile = migrateProfile(
            await decryptJson(
              row.enc_profile as string,
              env.KEK_B64,
              'guests',
              row.email_hash as string,
              'profile'
            ),
            events
          );
        } catch (error) {
          logError('admin/group-email/decrypt-failed', error);
          continue;
        }

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
            addRecipientEmail(profile.email);
            continue;
          }

          if (eventFilter === 'all') {
            const statuses: Array<'yes' | 'no' | 'pending'> = [];
            profile.party.forEach(member => {
              member.invitedEvents.forEach(eventId => {
                statuses.push(getAttendanceStatus(member.attendance?.[eventId]));
              });
            });

            if (statuses.length === 0) {
              continue;
            }

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
              addRecipientEmail(profile.email);
            }
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
            addRecipientEmail(profile.email);
          }
        } else {
          // No status filter, just add
          addRecipientEmail(profile.email);
        }
      }
    }

    const emails = Array.from(emailSet).sort();
    const total = emails.length;

    if (expectedTotal !== null && expectedTotal !== total) {
      return new Response(JSON.stringify({
        error: 'Recipient count mismatch. Send aborted.',
        expectedTotal,
        actualTotal: total
      }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' }
      }) as unknown as CfResponse;
    }

    if (total === 0) {
      return new Response(JSON.stringify({
        emailsSent: 0, failed: 0, total: 0, nextOffset: 0, done: true
      }), {
        headers: { 'Content-Type': 'application/json' }
      }) as unknown as CfResponse;
    }

    // Slice the batch from offset
    const batch = emails.slice(offset, offset + BATCH_SIZE);

    if (batch.length === 0) {
      return new Response(JSON.stringify({
        emailsSent: 0, failed: 0, total, nextOffset: offset, done: true
      }), {
        headers: { 'Content-Type': 'application/json' }
      }) as unknown as CfResponse;
    }

    // Send this batch
    // Gmail API limit: 150 emails/minute (2.5/sec), use 500ms delay to stay under
    let sentCount = 0;
    let failedCount = 0;

    for (let i = 0; i < batch.length; i++) {
      try {
        await sendGroupEmail(env, batch[i], subject, body);
        sentCount++;
      } catch (error) {
        // Log error but continue sending to others
        // NO PII: Don't log email address, just the error
        logError('admin/group-email/send-failed', error);
        failedCount++;
      }

      // Add 500ms delay between sends (except after last email)
      if (i < batch.length - 1) {
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

    const nextOffset = offset + batch.length;
    const done = nextOffset >= total;

    return new Response(JSON.stringify({
      emailsSent: sentCount,
      failed: failedCount,
      total,
      nextOffset,
      done,
    }), {
      status: failedCount > 0 && sentCount > 0 ? 207 : failedCount > 0 ? 500 : 200,
      headers: { 'Content-Type': 'application/json' }
    }) as unknown as CfResponse;

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
