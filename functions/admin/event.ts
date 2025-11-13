import type { PagesFunction, Response as CfResponse } from '@cloudflare/workers-types';
import { decryptJson, encryptJson } from '../../src/lib/crypto';
import { logError } from '../../src/lib/logger';
import { requireAccessAssertion } from '../../src/lib/access';
import {
  normalizeEventDetails,
  isValidISODate,
  isValidTimeZone,
  isHttpUrl
} from '../../src/lib/eventNormalization';
import { PayloadTooLargeError, readJsonWithinLimit } from '../../src/lib/request';
import type { Env, EventDetails } from '../../src/types';

function buildEmptyEvent(now: number): EventDetails {
  const iso = new Date(now * 1000).toISOString();
  return {
    schemaVersion: 6,
    siteTitle: '',
    heroHeadline: undefined,
    magicLinkEmailSubject: undefined,
    inviteEmailSubject: undefined,
    dateISO: iso,
    timeZone: 'UTC',
    rsvpDeadlineISO: undefined,
    rsvpStatus: { mode: 'open' },
    events: [],
    accommodations: [],
    registry: [],
    localGuide: undefined,
    transportationGuide: undefined,
    ceremonyGuide: undefined,
    updatedAt: now
  };
}

async function ensureEventRecord(env: Env): Promise<EventDetails> {
  const now = Math.floor(Date.now() / 1000);
  const base = buildEmptyEvent(now);
  const enc = await encryptJson(base, env.KEK_B64, 'event', '1', 'details');

  await env.DB.prepare(`
    INSERT INTO event (id, enc_details, updated_at)
    VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET enc_details = excluded.enc_details, updated_at = excluded.updated_at
  `).bind(enc, now).run();

  return base;
}

// GET /admin/event - Get event details
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  const authResult = await requireAccessAssertion(request, env);
  if (authResult instanceof Response) {
    return authResult as unknown as CfResponse;
  }

  try {
    const event = await env.DB.prepare(
      'SELECT enc_details, updated_at FROM event WHERE id = 1'
    ).first();

    if (!event || !event.enc_details) {
      const seeded = await ensureEventRecord(env);
      return new Response(JSON.stringify(seeded), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store'
        }
      }) as unknown as CfResponse;
    }

    const decrypted = await decryptJson(
      event.enc_details as string,
      env.KEK_B64,
      'event',
      '1',
      'details'
    );

    const { details, didMutate } = normalizeEventDetails(
      decrypted,
      { updatedAtFromRow: (event as any).updated_at as number | undefined }
    );

    if (didMutate) {
      const persistedAt = details.updatedAt ?? Math.floor(Date.now() / 1000);
      const encDetails = await encryptJson(
        details,
        env.KEK_B64,
        'event',
        '1',
        'details'
      );

      await env.DB.prepare(
        'UPDATE event SET enc_details = ?, updated_at = ? WHERE id = 1'
      ).bind(encDetails, persistedAt).run();
    }

    return new Response(JSON.stringify(details), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      }
    }) as unknown as CfResponse;

  } catch (error) {
    logError('admin/event/get', error);
    return new Response('Internal error', { status: 500 }) as unknown as CfResponse;
  }
};

// POST /admin/event - Update event details
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  const authResult = await requireAccessAssertion(request, env);
  if (authResult instanceof Response) {
    return authResult as unknown as CfResponse;
  }

  try {
    const { data: input } = await readJsonWithinLimit<Partial<EventDetails>>(request, 65536);

    // Validate and normalize
    const errors: string[] = [];
    const siteTitle = (input.siteTitle ?? '').toString().trim();
    if (!siteTitle) errors.push('siteTitle is required');

    const heroHeadline = typeof input.heroHeadline === 'string' ? input.heroHeadline.trim() : undefined;
    const magicLinkEmailSubject = typeof input.magicLinkEmailSubject === 'string'
      ? input.magicLinkEmailSubject.trim()
      : undefined;
    const inviteEmailSubject = typeof input.inviteEmailSubject === 'string'
      ? input.inviteEmailSubject.trim()
      : undefined;

    const dateISO = (input.dateISO || '').toString().trim();
    if (!isValidISODate(dateISO)) errors.push('dateISO must be a valid ISO date');

    const timeZone = (input.timeZone || '').toString().trim();
    if (!isValidTimeZone(timeZone)) errors.push('timeZone must be a valid IANA time zone');

    // Validate events array
    if (Array.isArray(input.events)) {
      input.events.forEach((event, idx) => {
        const label = (event?.label || '').toString().trim();
        if (!label) errors.push(`events[${idx}].label is required`);
        const hasStartISO = event?.startISO && isValidISODate(event.startISO);
        if (!hasStartISO) {
          errors.push(`events[${idx}] must have startISO`);
        }
        if (event?.startISO && !isValidISODate(event.startISO)) errors.push(`events[${idx}].startISO is invalid`);
        if (event?.endISO && !isValidISODate(event.endISO)) errors.push(`events[${idx}].endISO is invalid`);
      });
    }

    // Validate accommodations array
    if (Array.isArray(input.accommodations)) {
      input.accommodations.forEach((acc, idx) => {
        if (!acc?.name || !acc?.address) {
          errors.push(`accommodations[${idx}].name and address are required`);
        }
      });
    }

    if (Array.isArray(input.registry)) {
      input.registry.forEach((r, idx) => {
        if (!r?.label || !r?.url) {
          errors.push(`registry[${idx}].label and url are required`);
        } else if (!isHttpUrl(r.url)) {
          errors.push(`registry[${idx}].url must be http/https`);
        }
      });
    }

    // Validate per-event meal options when required
    if (Array.isArray(input.events)) {
      input.events.forEach((event, idx) => {
        if (!event || typeof event !== 'object') {
          return;
        }
        if (event.requiresMealSelection) {
          if (!Array.isArray(event.mealOptions)) {
            errors.push(`events[${idx}].mealOptions must be an array when requiresMealSelection is true`);
            return;
          }
          const trimmed = event.mealOptions
            .map(option => (typeof option === 'string' ? option.trim() : ''))
            .filter(Boolean);
          if (trimmed.length === 0) {
            errors.push(`events[${idx}].mealOptions must include at least one value when requiresMealSelection is true`);
          }
        }
      });
    }

    if (errors.length) {
      return new Response(JSON.stringify({ errors }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }) as unknown as CfResponse;
    }

    const now = Math.floor(Date.now() / 1000);

    const { details: canonical } = normalizeEventDetails(
      {
        schemaVersion: 6,
        siteTitle,
        heroHeadline,
        magicLinkEmailSubject,
        inviteEmailSubject,
        dateISO,
        timeZone,
        rsvpDeadlineISO: input.rsvpDeadlineISO,
        events: input.events,
        accommodations: input.accommodations,
        registry: input.registry,
        localGuide: input.localGuide,
        transportationGuide: input.transportationGuide,
        ceremonyGuide: input.ceremonyGuide,
        rsvpStatus: input.rsvpStatus,
        updatedAt: now
      },
      { now }
    );

    const persistedAt = canonical.updatedAt ?? now;

    const encDetails = await encryptJson(
      canonical,
      env.KEK_B64,
      'event',
      '1',
      'details'
    );

    const existing = await env.DB.prepare(
      'SELECT id FROM event WHERE id = 1'
    ).first();

    if (existing) {
      await env.DB.prepare(
        'UPDATE event SET enc_details = ?, updated_at = ? WHERE id = 1'
      ).bind(encDetails, persistedAt).run();
    } else {
      await env.DB.prepare(
        'INSERT INTO event (id, enc_details, updated_at) VALUES (1, ?, ?)'
      ).bind(encDetails, persistedAt).run();
    }

    await env.DB.prepare(
      'INSERT INTO audit_events (type, created_at) VALUES (?, ?)'
    ).bind('event_updated', now).run();

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    }) as unknown as CfResponse;

  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return new Response(JSON.stringify({ error: 'Payload too large' }), {
        status: 413,
        headers: { 'Content-Type': 'application/json' }
      }) as unknown as CfResponse;
    }
    logError('admin/event/post', error);
    return new Response('Internal error', { status: 500 }) as unknown as CfResponse;
  }
};
