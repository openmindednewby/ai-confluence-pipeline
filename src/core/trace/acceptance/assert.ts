/**
 * Assertions for an executed step. Four kinds (all opt-in via `expect`): HTTP status / process exit
 * code, JSON-path (`$.a.b`, `$.items[0].id`) with the keywords `exists`/`absent` or a literal to equal,
 * response header equals (case-insensitive), and body/stdout contains-substring. Pure: takes an
 * `Expect` + an `Actual` snapshot and returns a list of human-readable failure strings (empty = pass).
 */
import type { Expect } from './model.js';

export interface Actual {
  status?: number; // HTTP
  exit?: number; // process
  headers?: Record<string, string>; // lower-cased keys
  body: string; // raw response body / stdout
  json?: unknown; // parsed body if it was JSON (else undefined)
}

const PATH_TOKEN = /\.([^.[\]]+)|\[(\d+)\]|\["([^"]+)"\]/g;

/** Resolve a `$.a.b[0]["c"]` path; returns `undefined` if any hop is missing. */
export function jsonPath(root: unknown, path: string): unknown {
  let cur: unknown = root;
  const body = path.replace(/^\$/, '');
  if (body === '') return root;
  for (let m = PATH_TOKEN.exec(body); m; m = PATH_TOKEN.exec(body)) {
    const key = m[1] ?? m[3] ?? m[2];
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function valueEquals(actual: unknown, expected: unknown): boolean {
  if (actual !== null && typeof actual === 'object') return JSON.stringify(actual) === JSON.stringify(expected);
  return actual === expected;
}

function checkJson(json: unknown, expects: NonNullable<Expect['json']>): string[] {
  const failures: string[] = [];
  for (const [path, expected] of Object.entries(expects)) {
    const got = jsonPath(json, path);
    if (expected === 'exists') {
      if (got === undefined) failures.push(`json ${path}: expected to exist, was missing`);
    } else if (expected === 'absent') {
      if (got !== undefined) failures.push(`json ${path}: expected absent, got ${JSON.stringify(got)}`);
    } else if (!valueEquals(got, expected)) {
      failures.push(`json ${path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(got)}`);
    }
  }
  return failures;
}

/** Check an `Expect` against an `Actual`; returns failure messages (empty array = passed). */
export function checkExpect(expect: Expect, actual: Actual): string[] {
  const failures: string[] = [];
  if (expect.status !== undefined && actual.status !== expect.status) {
    failures.push(`status: expected ${expect.status}, got ${actual.status ?? '(none)'}`);
  }
  if (expect.exit !== undefined && actual.exit !== expect.exit) {
    failures.push(`exit: expected ${expect.exit}, got ${actual.exit ?? '(none)'}`);
  }
  if (expect.headers) {
    for (const [name, want] of Object.entries(expect.headers)) {
      const got = actual.headers?.[name.toLowerCase()];
      if (got !== want) failures.push(`header ${name}: expected "${want}", got ${got === undefined ? '(absent)' : `"${got}"`}`);
    }
  }
  if (expect.bodyContains) {
    for (const sub of expect.bodyContains) {
      if (!actual.body.includes(sub)) failures.push(`body: expected to contain "${sub}"`);
    }
  }
  if (expect.json) failures.push(...checkJson(actual.json, expect.json));
  return failures;
}
