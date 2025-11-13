import { globSync } from 'glob';
import { readFileSync } from 'fs';

const DEFAULT_SOURCES = ['src/**/*.ts', 'functions/**/*.ts'];

export type FileScannerOptions = {
  sources?: string[];
  ignore?: (path: string) => boolean;
};

export type ScanResult = {
  file: string;
  line: number;
  content: string;
};

export type ScanPredicateInput = {
  path: string;
  content: string;
  line: string;
  index: number;
  lines: string[];
};

export function readSourceFiles(options: FileScannerOptions = {}): string[] {
  const { sources = DEFAULT_SOURCES, ignore } = options;
  const files = sources.flatMap(pattern => globSync(pattern, { nodir: true }));
  return ignore ? files.filter(path => !ignore(path)) : files;
}

export function scanFileLines(
  path: string,
  predicate: (input: ScanPredicateInput) => boolean
): ScanResult[] {
  const content = readFileSync(path, 'utf-8');
  const lines = content.split('\n');
  const findings: ScanResult[] = [];

  lines.forEach((line, index) => {
    if (predicate({ path, content, line, index, lines })) {
      findings.push({
        file: path,
        line: index + 1,
        content: line.trim()
      });
    }
  });

  return findings;
}

export function scanSource(
  predicate: (input: ScanPredicateInput) => boolean,
  options: FileScannerOptions = {}
): ScanResult[] {
  const files = readSourceFiles(options);
  return files.flatMap(path => scanFileLines(path, predicate));
}
