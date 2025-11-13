// ABOUTME: Detects common anti-patterns that LLMs introduce.
// ABOUTME: Catches console.log, unjustified any types, TODO comments, and other code smells.

import { describe, it, expect } from 'vitest';
import {
  scanSource,
  readSourceFiles,
  scanFileLines,
  type ScanResult
} from './helpers/scan-files';

describe('Anti-pattern detection', () => {
  it('does not use console.log in production code', () => {
    const violations = scanSource(
      ({ line }) =>
        line.includes('console.log') && !line.includes('// OK: console.log'),
      {
        ignore: path => path.includes('logger.ts') || path.includes('/logger/')
      }
    );

    if (violations.length > 0) {
      throw new Error(
        `Found ${violations.length} console.log statements in production code:\n` +
        violations.slice(0, 10).map(v => `${v.file}:${v.line}`).join('\n') +
        (violations.length > 10 ? `\n... and ${violations.length - 10} more` : '')
      );
    }

    expect(violations).toHaveLength(0);
  });

  it('does not use any type without justification comment', () => {
    const violations = scanSource(({ path, line, index, lines }) => {
      if (!line.includes(': any')) {
        return false;
      }

      const prevLine = lines[index - 1] || '';
      if (prevLine.includes('// OK: any') || line.includes('// OK: any')) {
        return false;
      }

      if (path.includes('crypto.ts') && line.includes('data: any')) {
        return false;
      }

      if ((path.includes('profileUtils.ts') || path.includes('migration')) &&
          (line.includes('raw') || line.includes('member'))) {
        return false;
      }

      if (line.includes('guest: any') && line.includes('.map')) {
        return false;
      }

      return true;
    });

    if (violations.length > 0) {
      throw new Error(
        `Found ${violations.length} unjustified 'any' types:\n` +
        violations.slice(0, 10).map(v => `${v.file}:${v.line}: ${v.content.substring(0, 80)}`).join('\n') +
        (violations.length > 10 ? `\n... and ${violations.length - 10} more` : '')
      );
    }

    expect(violations).toHaveLength(0);
  });

  it('does not have TODO or FIXME comments in production code', () => {
    const violations = scanSource(({ line }) => line.includes('TODO') || line.includes('FIXME'));

    if (violations.length > 0) {
      throw new Error(
        `Found ${violations.length} TODO/FIXME comments:\n` +
        violations.slice(0, 10).map(v => `${v.file}:${v.line}: ${v.content}`).join('\n') +
        (violations.length > 10 ? `\n... and ${violations.length - 10} more` : '')
      );
    }

    expect(violations).toHaveLength(0);
  });

  it('does not use console.error without proper error handling', () => {
    const violations = scanSource(
      ({ path, line }) =>
        line.includes('console.error') &&
        !path.includes('logger.ts') &&
        !path.includes('/logger/') &&
        !line.includes('// OK: console.error')
    );

    if (violations.length > 0) {
      throw new Error(
        `Found ${violations.length} raw console.error statements (use logError instead):\n` +
        violations.slice(0, 10).map(v => `${v.file}:${v.line}`).join('\n') +
        (violations.length > 10 ? `\n... and ${violations.length - 10} more` : '')
      );
    }

    expect(violations).toHaveLength(0);
  });

  it('does not have empty catch blocks', () => {
    const violations = readSourceFiles().flatMap(path => {
      const findings: ScanResult[] = [];
      let inCatchBlock = false;
      let catchStartLine = -1;

      scanFileLines(path, ({ line, index, lines }) => {
        if (line.includes('catch') && line.includes('{')) {
          inCatchBlock = true;
          catchStartLine = index;
        } else if (inCatchBlock && line.trim() === '}') {
          const blockContent = lines.slice(catchStartLine + 1, index).map(text => text.trim()).filter(Boolean);
          if (blockContent.length === 0 && !lines[catchStartLine].includes('// OK: empty')) {
            findings.push({
              file: path,
              line: catchStartLine + 1,
              content: line.trim()
            });
          }
          inCatchBlock = false;
        }
        return false;
      });

      return findings;
    });

    if (violations.length > 0) {
      throw new Error(
        `Found ${violations.length} empty catch blocks:\n` +
        violations.slice(0, 10).map(v => `${v.file}:${v.line}: ${v.content}`).join('\n') +
        (violations.length > 10 ? `\n... and ${violations.length - 10} more` : '')
      );
    }

    expect(violations).toHaveLength(0);
  });

  it('does not have hardcoded credentials or secrets', () => {
    const suspiciousPatterns = [
      /password\s*=\s*['"][^'"]{8,}['"]/i,
      /api[_-]?key\s*=\s*['"][^'"]{8,}['"]/i,
      /secret\s*=\s*['"][^'"]{8,}['"]/i,
      /token\s*=\s*['"][a-zA-Z0-9]{20,}['"]/i,
    ];

    const violations = scanSource(
      ({ path, line }) => {
        if (path.includes('.test.') || line.includes('// OK: hardcoded')) {
          return false;
        }
        return suspiciousPatterns.some(pattern => pattern.test(line));
      }
    );

    if (violations.length > 0) {
      throw new Error(
        `Found ${violations.length} potential hardcoded credentials:\n` +
        violations.slice(0, 5).map(v => `${v.file}:${v.line}: ${v.content.substring(0, 60)}...`).join('\n') +
        (violations.length > 5 ? `\n... and ${violations.length - 5} more` : '')
      );
    }

    expect(violations).toHaveLength(0);
  });
});
