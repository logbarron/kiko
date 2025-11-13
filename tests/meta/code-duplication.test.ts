// ABOUTME: Detects code duplication using jscpd.
// ABOUTME: Catches LLM copy-paste mistakes and enforces DRY principle.

import { describe, it, expect } from 'vitest';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, rmSync } from 'fs';

const execAsync = promisify(exec);
const JSCPD_COMMAND =
  'npx jscpd src functions --min-lines 5 --min-tokens 50 --threshold 5 --silent --reporters console';
const JSCPD_ARTIFACTS = ['.jscpd.json', '.jscpd-report.json', '.jscpd-report.xml', '.jscpd-report'];

function extractDuplicationPercentage(output: string): number | null {
  const targeted = output.match(/found[^%]*?(\d+(?:\.\d+)?)%\s*duplication/i);
  if (targeted) {
    return Number.parseFloat(targeted[1]);
  }

  const generic = output.match(/(\d+(?:\.\d+)?)%/);
  return generic ? Number.parseFloat(generic[1]) : null;
}

function collectArtifacts(): string[] {
  return JSCPD_ARTIFACTS.filter(path => existsSync(path));
}

function removeArtifacts(): void {
  collectArtifacts().forEach(path => {
    rmSync(path, { recursive: true, force: true });
  });
}

function logDuplicationPercentage(percentage: number): void {
  const formatted =
    Number.isInteger(percentage) ? percentage.toFixed(0) : percentage.toFixed(2);
  console.info(`[jscpd] code duplication: ${formatted}%`);
}

describe('Code duplication detection', () => {
  it('has less than 5% code duplication', async () => {
    removeArtifacts();
    let commandFailed = false;
    try {
      const { stdout, stderr } = await execAsync(JSCPD_COMMAND, {
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, CI: process.env.CI ?? 'true' }
      });

      const output = `${stdout}${stderr}`;
      const percentage = extractDuplicationPercentage(output);
      if (percentage !== null) {
        logDuplicationPercentage(percentage);
      } else {
        console.warn('[jscpd] unable to determine duplication percentage from output');
      }

      expect(percentage).not.toBeNull();
      if (percentage !== null) {
        expect(percentage).toBeLessThanOrEqual(5);
      }

    } catch (error: any) {
      commandFailed = true;
      if (error.message?.includes('command not found') ||
          error.message?.includes('ENOENT')) {
        throw new Error(
          'jscpd not found. Install with: npm install -D jscpd\n' +
          'Or run with npx: npx jscpd src functions'
        );
      }

      const output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
      const percentage = extractDuplicationPercentage(output);

      if (percentage !== null) {
        logDuplicationPercentage(percentage);
        throw new Error(
          `Code duplication exceeds 5% threshold (found: ${percentage}%).\n` +
          `Run 'npx jscpd src functions --min-lines 5 --min-tokens 50' for details.`
        );
      }

      throw new Error(
        `jscpd check failed: ${error.message}\n` +
        `Output:\n${output || '[no output]'}`
      );
    } finally {
      const leftovers = collectArtifacts();
      if (leftovers.length > 0) {
        removeArtifacts();
        if (!commandFailed) {
          throw new Error(
            `jscpd left behind report artifacts: ${leftovers.join(', ')}. ` +
            'Ensure reports are not committed.'
          );
        }
      }
    }
  }, 90000); // 90 second timeout for large codebases
});
