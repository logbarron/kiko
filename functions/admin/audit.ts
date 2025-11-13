import type { PagesFunction, Response as CfResponse } from '@cloudflare/workers-types';
import { logError } from '../../src/lib/logger';
import { requireAccessAssertion } from '../../src/lib/access';
import type { Env } from '../../src/types';

const DEFAULT_AUDIT_LIMIT = 100;
const MIN_AUDIT_LIMIT = 1;
const MAX_AUDIT_LIMIT = 500;

export function resolveAuditLimit(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (Number.isNaN(parsed)) return DEFAULT_AUDIT_LIMIT;
  return Math.min(Math.max(parsed, MIN_AUDIT_LIMIT), MAX_AUDIT_LIMIT);
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  const authResult = await requireAccessAssertion(request, env);
  if (authResult instanceof Response) {
    return authResult as unknown as CfResponse;
  }
  
  try {
    const url = new URL(request.url);
    const guestId = url.searchParams.get('guest_id');
    const limit = resolveAuditLimit(url.searchParams.get('limit'));

    let query: string;
    let params: (string | number)[] = [limit];
    
    if (guestId) {
      query = `
        SELECT 
          id,
          guest_id,
          type,
          created_at
        FROM audit_events
        WHERE guest_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `;
      params = [guestId, limit];
    } else {
      query = `
        SELECT 
          ae.id,
          ae.guest_id,
          ae.type,
          ae.created_at
        FROM audit_events ae
        ORDER BY ae.created_at DESC
        LIMIT ?
      `;
    }
    
    const events = await env.DB.prepare(query).bind(...params).all();
    
    return new Response(JSON.stringify(events.results || []), {
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      }
    }) as unknown as CfResponse;
    
  } catch (error) {
    logError('admin/audit', error);
    return new Response('Internal error', { status: 500 }) as unknown as CfResponse;
  }
};

export { resolveAuditLimit as _resolveAuditLimit };
