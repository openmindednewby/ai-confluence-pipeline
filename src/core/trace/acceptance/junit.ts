/**
 * Render an acceptance run as JUnit XML keyed by requirement, so `trace`'s existing JUnit ingestion
 * maps each case back to its requirement (the key is embedded in the testcase name + classname). This is
 * the bridge that lets an acceptance pass flip a requirement to ✅ verified with zero new trace plumbing.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AcceptanceRunResult, CaseResult } from './runner.js';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function caseXml(c: CaseResult): string {
  const name = esc(`${c.req} ${c.name}`.trim());
  const time = (c.durationMs / 1000).toFixed(3);
  const open = `    <testcase name="${name}" classname="acceptance ${esc(c.req)}" time="${time}">`;
  if (c.ok) return `${open}</testcase>`;
  const detail = c.failure ?? (c.steps.flatMap((s) => s.failures).join('; ') || 'failed');
  return `${open}\n      <failure message="${esc(detail)}">${esc(detail)}</failure>\n    </testcase>`;
}

/** Serialise an acceptance result to a JUnit XML string. */
export function toJUnitXml(result: AcceptanceRunResult, suiteName = 'acceptance'): string {
  const body = result.cases.map(caseXml).join('\n');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuites tests="${result.total}" failures="${result.failed}">`,
    `  <testsuite name="${esc(suiteName)}" tests="${result.total}" failures="${result.failed}">`,
    body,
    '  </testsuite>',
    '</testsuites>',
    '',
  ].join('\n');
}

/** Write the JUnit XML to `path` (creating parent dirs). */
export function writeJUnit(path: string, result: AcceptanceRunResult, suiteName = 'acceptance'): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, toJUnitXml(result, suiteName), 'utf8');
}
