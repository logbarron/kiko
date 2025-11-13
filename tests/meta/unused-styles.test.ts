// ABOUTME: Flags CSS classes defined in event styles but not used anywhere else.
// ABOUTME: Prevents orphaned selectors when markup refactors drop class names.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const EVENT_STYLES_PATH = path.resolve('src/views/event/styles.ts');
const SEARCH_ROOTS = [
  'src',
  'functions',
  'tests',
  'public'
].map(dir => path.resolve(dir));
const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.json',
  '.md',
  '.html',
  '.txt',
  '.css'
]);

function listFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap(entry => {
    if (entry.name.startsWith('.')) {
      return [];
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return listFiles(fullPath);
    }
    const extension = path.extname(entry.name).toLowerCase();
    if (!TEXT_EXTENSIONS.has(extension)) {
      return [];
    }
    if (path.resolve(fullPath) === EVENT_STYLES_PATH) {
      return [];
    }
    return [fullPath];
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

describe('CSS orphan detection', () => {
  it('has no unused class selectors in event styles', () => {
    const cssSource = readFileSync(EVENT_STYLES_PATH, 'utf8');
    const classMatches = cssSource.match(/\.[A-Za-z_-][A-Za-z0-9_-]*/g) ?? [];
    const classNames = Array.from(new Set(classMatches.map(match => match.slice(1))));

    const searchFiles = SEARCH_ROOTS.flatMap(root => listFiles(root));
    const fileContents = searchFiles.map(file => readFileSync(file, 'utf8'));

    const unusedClasses = classNames.filter(className => {
      const pattern = new RegExp(`\\b${escapeRegExp(className)}\\b`);
      return !fileContents.some(content => pattern.test(content));
    });

    const details = unusedClasses.map(name => `.${name}`).join('\n');
    expect(
      unusedClasses.length,
      unusedClasses.length > 0
        ? `Unused CSS classes detected in ${path.relative(process.cwd(), EVENT_STYLES_PATH)}:\n${details}`
        : undefined
    ).toBe(0);
  });
});
