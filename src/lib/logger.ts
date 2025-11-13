/**
 * Guarded logging utilities that respect deployment log settings.
 */

function shouldLog(): boolean {
  if (typeof globalThis !== 'undefined' && (globalThis as any).__ENABLE_DEBUG_LOGS__ === true) {
    return true;
  }

  if (typeof process !== 'undefined' && process?.env) {
    const env = process.env as Record<string, string | undefined>;
    if (env.NODE_ENV === 'development') {
      return true;
    }
    if (env.ENABLE_DEBUG_LOGS === 'true') {
      return true;
    }
  }

  return false;
}

// Log error safely without exposing sensitive details
export function logError(context: string, error: unknown): void {
  if (!shouldLog()) {
    return;
  }

  console.log(`Error in ${context}:`, error instanceof Error ? error.message : 'Unknown error');
}
