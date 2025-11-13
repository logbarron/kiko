import { decryptJson, encryptJson } from '../../src/lib/crypto';
import { logError } from '../../src/lib/logger';
import { normalizeEventDetails } from '../../src/lib/eventNormalization';
import type { Env } from '../../src/types';
import type { EventSummary } from './profileUtils';

export type EventSummariesResult = {
  events: EventSummary[];
};

export async function loadEventSummaries(env: Env): Promise<EventSummariesResult> {
  const row = await env.DB.prepare(
    'SELECT enc_details, updated_at FROM event WHERE id = 1'
  ).first();

  if (!row || !row.enc_details) {
    return { events: [] };
  }

  try {
    const decrypted = await decryptJson(
      row.enc_details as string,
      env.KEK_B64,
      'event',
      '1',
      'details'
    );

    const { details, didMutate } = normalizeEventDetails(
      decrypted,
      { updatedAtFromRow: (row as any).updated_at as number | undefined }
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

    const events: EventSummary[] = (details.events ?? []).map((event) => ({
      id: event.id,
      label: event.label,
      requiresMealSelection: Boolean(event.requiresMealSelection),
      mealOptions: Array.isArray(event.mealOptions) && event.mealOptions.length > 0
        ? [...event.mealOptions]
        : undefined
    }));

    return { events };
  } catch (error) {
    logError('admin/loadEventSummaries', error);
    return { events: [] };
  }
}
