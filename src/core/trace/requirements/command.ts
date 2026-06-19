/**
 * The pluggable escape hatch: a `command` requirement source runs any script and reads its stdout as
 * requirements — JSON (an array of `{key,title,status?,complete?,url?}`) or markdown (the same shape
 * the `markdown` source parses). So a company can wire ANY system (a DB, a CSV, an internal API) as a
 * requirements source without forking — just emit JSON/markdown on stdout.
 */
import { spawnSync } from 'node:child_process';
import { isAbsolute, resolve } from 'node:path';
import { DEFAULT_KEY_PATTERN } from '../testScanner.js';
import type { Requirement } from '../types.js';
import { parseMarkdownRequirements } from './markdown.js';

export interface CommandSource {
  command: string;
  /** Force a parser; otherwise inferred (stdout starting with `[`/`{` → json, else markdown). */
  format?: 'json' | 'markdown';
  /** Working dir for the command (relative to the config dir; default the config dir). */
  cwd?: string;
}

const DONE_RE = /done|closed|complete|resolved|shipped|live/i;

/** Map a loose JSON requirement object to a Requirement. */
function fromJson(r: Record<string, unknown>, scope?: string): Requirement {
  const status = (r.status ?? r.declaredStatus ?? null) as string | null;
  const complete = (r.complete ?? r.declaredComplete) as boolean | undefined;
  return {
    key: String(r.key ?? '').toUpperCase(),
    title: (r.title as string) ?? String(r.key ?? ''),
    declaredStatus: status,
    declaredComplete: complete ?? (typeof status === 'string' && DONE_RE.test(status)),
    source: 'command',
    url: r.url as string | undefined,
    scope,
  };
}

/** Run the source command and parse its stdout into requirements. */
export function runCommandRequirements(
  src: CommandSource,
  baseDir: string,
  keyPattern = DEFAULT_KEY_PATTERN,
  scope?: string,
): Requirement[] {
  const cwd = src.cwd ? (isAbsolute(src.cwd) ? src.cwd : resolve(baseDir, src.cwd)) : baseDir;
  const res = spawnSync(src.command, { cwd, shell: true, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (res.status !== 0) {
    throw new Error(`requirement command failed (exit ${res.status ?? '?'}): ${src.command}\n${(res.stderr ?? '').slice(-500)}`);
  }
  const out = (res.stdout ?? '').trim();
  const asJson = src.format === 'json' || (src.format !== 'markdown' && /^[[{]/.test(out));
  if (asJson) {
    const data = JSON.parse(out) as unknown;
    const arr = Array.isArray(data) ? data : ((data as { requirements?: unknown[] }).requirements ?? []);
    return (arr as Array<Record<string, unknown>>).filter((r) => r && r.key).map((r) => fromJson(r, scope));
  }
  return parseMarkdownRequirements(out, keyPattern, 'command', scope);
}
