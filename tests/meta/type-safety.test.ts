// ABOUTME: Verifies TypeScript type safety across the codebase.
// ABOUTME: Catches LLM mistakes like missing await, wrong return types, and any abuse.

import { describe, it, expect } from 'vitest';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const TSC_COMMAND = 'npx tsc --noEmit --skipLibCheck';

function extractTypeScriptErrors(output: string): string[] {
  return output
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.includes('error TS'));
}

describe('Type safety enforcement', () => {
  it('passes TypeScript compilation with strict checks', async () => {
    try {
      const { stdout, stderr } = await execAsync(TSC_COMMAND);
      const errors = extractTypeScriptErrors(`${stdout}${stderr}`);
      expect(errors).toHaveLength(0);
    } catch (error: any) {
      const stdout = error.stdout ?? '';
      const stderr = error.stderr ?? '';
      const errors = extractTypeScriptErrors(`${stdout}${stderr}`);

      if (errors.length > 0) {
        console.error('[tsc] Compilation errors:\n' + errors.join('\n'));
        throw new Error('TypeScript compilation failed. See console for details.');
      }

      if (error.code !== 0) {
        throw new Error(`tsc exited with code ${error.code ?? 'unknown'}. stderr: ${stderr || 'n/a'}`);
      }

      throw error;
    }
  }, 60000); // 60 second timeout for large codebases
});
