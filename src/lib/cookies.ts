import type { Env, Session } from '../types';
import { generateToken, hashToken } from './crypto';

export async function createSession(
  guestId: number,
  env: Env
): Promise<{ cookie: string; sessionIdHash: string }> {
  const sessionId = generateToken();
  const sessionIdHash = await hashToken(sessionId, env.KEK_B64);

  // Local dev support: allow cookie over http://localhost by dropping Secure and using a non-__Host name
  const devMode = (env as any).DEV_MODE === 'true';
  const cookieName = devMode ? 's' : '__Host-s';

  const parts = [
    `${cookieName}=${sessionId}`,
    'HttpOnly',
    // Lax allows top-level nav after magic-link redirect; safer than None and works across redirect
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${parseInt(env.SESSION_ABSOLUTE_HOURS) * 3600}`
  ];
  if (!devMode) parts.push('Secure');

  const cookie = parts.join('; ');

  return { cookie, sessionIdHash };
}

export async function validateSession(
  cookieHeader: string,
  env: Env
): Promise<Session | null> {
  // Parse cookie
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map(c => {
      const [key, ...val] = c.trim().split('=');
      return [key, val.join('=')];
    })
  );

  const devMode = (env as any).DEV_MODE === 'true';
  const sessionId = cookies['__Host-s'] || (devMode ? cookies['s'] : undefined);
  if (!sessionId) {
    return null;
  }
  
  // Hash session ID to find in DB
  const sessionIdHash = await hashToken(sessionId, env.KEK_B64);
  const now = Math.floor(Date.now() / 1000);
  
  // Find session
  const session = await env.DB.prepare(
    `SELECT * FROM sessions 
     WHERE session_id_hash = ? 
     AND expires_at > ?`
  ).bind(sessionIdHash, now).first() as Session | null;
  
  if (!session) {
    return null;
  }
  
  // Check idle timeout
  const idleTimeout = parseInt(env.SESSION_IDLE_MIN) * 60;
  if (session.last_seen_at + idleTimeout < now) {
    // Session expired due to inactivity
    await env.DB.prepare(
      'DELETE FROM sessions WHERE id = ?'
    ).bind(session.id).run();
    return null;
  }
  
  // Update last seen
  await env.DB.prepare(
    'UPDATE sessions SET last_seen_at = ? WHERE id = ?'
  ).bind(now, session.id).run();
  
  return session;
}
