import type { Env } from '../types';

export async function checkRateLimit(
  env: Env,
  key: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  if (!env.RATE_LIMIT_KV) {
    if ((env as any).DEV_MODE === 'true') {
      return true;
    }
    return false;
  }
  
  const now = Math.floor(Date.now() / 1000);
  const windowKey = `${key}:${Math.floor(now / windowSeconds)}`;
  
  const current = await env.RATE_LIMIT_KV.get(windowKey);
  const count = current ? parseInt(current) : 0;
  
  if (count >= limit) {
    return false;
  }
  
  await env.RATE_LIMIT_KV.put(
    windowKey,
    (count + 1).toString(),
    { expirationTtl: windowSeconds }
  );
  
  return true;
}
