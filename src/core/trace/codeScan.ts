/**
 * Code-side gap signal. Scan implementation code (the scope's `code` globs) for `@KEY` tags — the same
 * convention used in tests — so each requirement gets a deterministic "referenced in code?" answer.
 * Combined with the test/result join this gives the implementation gap: requirements that are declared
 * but have no code reference (📋 not started) vs. coded-but-untested vs. fully verified. No AI needed.
 */
import { scanTestSources } from './testScanner.js';
import type { TraceReport } from './types.js';

/** The set of requirement keys referenced anywhere in the configured code globs. */
export function scanCodeKeys(repoDir: string, codeGlobs: string[], keyPattern: string): Set<string> {
  if (!codeGlobs.length) return new Set();
  const refs = scanTestSources(repoDir, [{ tech: 'generic', globs: codeGlobs }], keyPattern);
  return new Set(refs.map((r) => r.key.toUpperCase()));
}

/** Mark each requirement's `inCode` from the scanned code keys (no-op when nothing was scanned). */
export function markImplemented(report: TraceReport, codeKeys: Set<string>, scanned: boolean): void {
  let n = 0;
  for (const r of report.requirements) {
    r.inCode = scanned ? codeKeys.has(r.key.toUpperCase()) : null;
    if (r.inCode === true) n += 1;
  }
  report.stats.implemented = n;
}
