// ABOUTME: Detects unused exports and dead code using ts-prune.
// ABOUTME: Catches LLM mistakes where functions/types are created but never used.

import { describe, it, expect } from 'vitest';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const TS_PRUNE_COMMAND = 'npx ts-prune --project tsconfig.json';
const ALLOWLIST_PATTERNS: RegExp[] = [
  /vitest\.config/i,
  /\.test\.ts/i,
  /\/types\.ts/i,
  /index\.ts.*default/i,
  /functions\/.*onRequest/i,
  /_middleware\.ts.*onRequest/i,
  /scripts\/.*default/i,
  /(_resolve|_build|_helper)/i
];

function parseUnusedExports(output: string): string[] {
  return output
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => line.includes('.ts:'))
    .filter(line => !line.includes('(used in module)'))
    .filter(line => !ALLOWLIST_PATTERNS.some(pattern => pattern.test(line)));
}

describe('Dead code detection', () => {
  it('has ts-prune available on the PATH', async () => {
    const { stdout } = await execAsync('npx ts-prune --version', {
      maxBuffer: 2 * 1024 * 1024
    });
    expect(stdout.trim().length).toBeGreaterThan(0);
  });

  it('has no unused exports', async () => {
    try {
      const { stdout, stderr } = await execAsync(TS_PRUNE_COMMAND, {
        maxBuffer: 10 * 1024 * 1024
      });
      const unusedExports = parseUnusedExports(`${stdout}${stderr}`);
      if (unusedExports.length > 0) {
        console.error('[ts-prune] Potentially unused exports:\n' + unusedExports.join('\n'));
        throw new Error(
          `Found ${unusedExports.length} unused exports.\n` +
          'Inspect the console output above for details.'
        );
      }
      expect(unusedExports).toHaveLength(0);
    } catch (error: any) {
      const combinedOutput = `${error.stdout ?? ''}${error.stderr ?? ''}`;
      const unusedExports = combinedOutput ? parseUnusedExports(combinedOutput) : [];

      if (unusedExports.length > 0) {
        console.error('[ts-prune] Potentially unused exports:\n' + unusedExports.join('\n'));
        throw new Error(
          `Found ${unusedExports.length} unused exports.\n` +
          'Inspect the console output above for details.'
        );
      }

      if (error.message?.includes('command not found') ||
          error.message?.includes('ENOENT')) {
        throw new Error(
          'ts-prune not found. Install with: npm install -D ts-prune\n' +
          'Or run with npx: npx ts-prune'
        );
      }

      // Re-throw if it's our custom error
      if (error.message?.includes('Found') && error.message?.includes('unused exports')) {
        throw error;
      }

      // For other errors, check if it's just a missing tsconfig
      if (error.message?.includes('tsconfig')) {
        throw new Error('tsconfig.json not found. ts-prune requires a valid tsconfig.json');
      }

      throw new Error(`ts-prune check failed: ${error.message}`);
    }
  }, 90000); // 90 second timeout
});
