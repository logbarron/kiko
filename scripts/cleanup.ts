#!/usr/bin/env node
// Nightly cleanup cron job - delete expired magic_links and sessions

import type { Env } from '../src/types';
import { logError } from '../src/lib/logger';

export async function cleanup(env: Env): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  
  try {
    // Delete expired magic links
    const expiredLinks = await env.DB.prepare(
      'DELETE FROM magic_links WHERE expires_at < ?'
    ).bind(now).run();
    
    console.log(`Deleted ${expiredLinks.meta.changes} expired magic links`);
    
    // Delete expired sessions
    const expiredSessions = await env.DB.prepare(
      'DELETE FROM sessions WHERE expires_at < ?'
    ).bind(now).run();
    
    console.log(`Deleted ${expiredSessions.meta.changes} expired sessions`);
    
    // Delete idle sessions
    const idleTimeout = parseInt(env.SESSION_IDLE_MIN) * 60;
    const idleCutoff = now - idleTimeout;
    
    const idleSessions = await env.DB.prepare(
      'DELETE FROM sessions WHERE last_seen_at < ?'
    ).bind(idleCutoff).run();
    
    console.log(`Deleted ${idleSessions.meta.changes} idle sessions`);
    
    // Optional: Clean up old audit events (keep last 90 days)
    const auditCutoff = now - (90 * 24 * 60 * 60);
    const oldAudits = await env.DB.prepare(
      'DELETE FROM audit_events WHERE created_at < ?'
    ).bind(auditCutoff).run();
    
    console.log(`Deleted ${oldAudits.meta.changes} old audit events`);
    
  } catch (error) {
    logError('cleanup', error);
    throw error;
  }
}

// Cloudflare Scheduled Event handler
export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(cleanup(env));
  }
};