import type { PagesFunction, Response as CfResponse } from '@cloudflare/workers-types';
import { renderAdminDashboard } from '../../src/views/admin';
import { logError } from '../../src/lib/logger';
import { requireAccessAssertion } from '../../src/lib/access';
import type { Env } from '../../src/types';

// Note: Cloudflare Access gates this entire /admin/* path
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  const authResult = await requireAccessAssertion(request, env);
  if (authResult instanceof Response) {
    return authResult as unknown as CfResponse;
  }

  try {
    const nonce = ((context.data as any) && (context.data as any).nonce) as string;
    const html = renderAdminDashboard(nonce);
    
    return new Response(html, {
      headers: {
        'Content-Type': 'text/html',
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow'
      }
    }) as unknown as CfResponse;
    
  } catch (error) {
    logError('admin/dashboard', error);
    return new Response('Internal error', { status: 500 }) as unknown as CfResponse;
  }
};
