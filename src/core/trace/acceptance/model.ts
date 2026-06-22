/**
 * Acceptance-test model (Phase 2) — the one canonical shape every spec front-end (JSON / YAML-lite /
 * markdown-table / inline ` ```acp-test ` block) normalises into. A spec belongs to one requirement
 * KEY and holds named cases; each case is an ordered list of steps. A step is either an HTTP request
 * or a CLI/process invocation, with `expect` assertions and optional `capture` of variables for
 * step-to-step chaining. This module is pure types + normalisation — no IO, no execution.
 */

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

/** Assertions for a step. HTTP uses status/json/headers/bodyContains; process uses exit/stdout/bodyContains. */
export interface Expect {
  status?: number; // HTTP status code
  json?: Record<string, string | number | boolean | null>; // $.path → 'exists' | 'absent' | literal-to-equal
  headers?: Record<string, string>; // header name (case-insensitive) → equals
  bodyContains?: string[]; // raw body / stdout contains each substring
  exit?: number; // process exit code
}

/** An HTTP request step. */
export interface HttpStep {
  kind: 'http';
  method: HttpMethod;
  url: string; // path (joined to runner.baseUrl) or absolute URL; may contain {{vars}}
  body?: unknown; // JSON body (object/array/scalar); may contain {{vars}} inside strings
  headers?: Record<string, string>;
  expect: Expect;
  capture?: Record<string, string>; // var → 'status' | 'header:Name' | a $.json.path
}

/** A CLI / process invocation step. */
export interface ProcessStep {
  kind: 'process';
  run: string; // command line; may contain {{vars}}
  cwd?: string;
  expect: Expect;
  capture?: Record<string, string>; // var → 'stdout' | 'exit'
}

export type Step = HttpStep | ProcessStep;

export interface AcceptanceCase {
  name: string;
  steps: Step[];
}

export interface AcceptanceSpec {
  req: string; // requirement key (e.g. PROJ-1)
  cases: AcceptanceCase[];
  source: string; // where it came from — file path or `inline:<reqfile>`
}

/** Thrown when a spec can't be normalised into the model. Message names the source + offending case. */
export class AcceptanceParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AcceptanceParseError';
  }
}

export function isHttpMethod(s: string): s is HttpMethod {
  return (HTTP_METHODS as readonly string[]).includes(s.toUpperCase());
}

function asRecord(v: unknown, where: string): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) {
    throw new AcceptanceParseError(`${where}: expected an object`);
  }
  return v as Record<string, unknown>;
}

/** Normalise a raw `expect` blob into a typed `Expect` (tolerant — unknown keys ignored). */
function normalizeExpect(raw: unknown, where: string): Expect {
  if (raw === undefined) return {};
  const r = asRecord(raw, `${where} expect`);
  const out: Expect = {};
  if (typeof r.status === 'number') out.status = r.status;
  if (typeof r.exit === 'number') out.exit = r.exit;
  if (r.json !== undefined) out.json = asRecord(r.json, `${where} expect.json`) as Expect['json'];
  if (r.headers !== undefined) {
    out.headers = asRecord(r.headers, `${where} expect.headers`) as Record<string, string>;
  }
  if (r.bodyContains !== undefined) out.bodyContains = toStringArray(r.bodyContains);
  // friendly alias for process steps
  if (r.stdoutContains !== undefined) {
    out.bodyContains = [...(out.bodyContains ?? []), ...toStringArray(r.stdoutContains)];
  }
  return out;
}

function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x));
  return [String(v)];
}

function normalizeCapture(raw: unknown, where: string): Record<string, string> | undefined {
  if (raw === undefined) return undefined;
  const r = asRecord(raw, `${where} capture`);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(r)) out[k] = String(v);
  return out;
}

/**
 * Normalise one raw authoring step into a typed `Step`. Authoring shape:
 *   HTTP:    { "POST": "/login", body?, headers?, expect?, capture? }   (first HTTP-method key wins)
 *   process: { "run": "node cli.js --help", cwd?, expect?, capture? }
 */
export function normalizeStep(raw: unknown, where: string): Step {
  const r = asRecord(raw, `${where} step`);
  const methodKey = Object.keys(r).find((k) => isHttpMethod(k));
  if (methodKey) {
    const step: HttpStep = {
      kind: 'http',
      method: methodKey.toUpperCase() as HttpMethod,
      url: String(r[methodKey]),
      expect: normalizeExpect(r.expect, where),
    };
    if (r.body !== undefined) step.body = r.body;
    if (r.headers !== undefined) step.headers = asRecord(r.headers, `${where} headers`) as Record<string, string>;
    const cap = normalizeCapture(r.capture, where);
    if (cap) step.capture = cap;
    return step;
  }
  if (typeof r.run === 'string') {
    const step: ProcessStep = { kind: 'process', run: r.run, expect: normalizeExpect(r.expect, where) };
    if (typeof r.cwd === 'string') step.cwd = r.cwd;
    const cap = normalizeCapture(r.capture, where);
    if (cap) step.capture = cap;
    return step;
  }
  throw new AcceptanceParseError(`${where}: step has no HTTP method key (GET/POST/…) nor a "run" command`);
}

/**
 * Normalise a raw authoring object `{ req, cases:[{name, steps:[…]}] }` into an `AcceptanceSpec`.
 * A single-case shorthand `{ req, name?, steps:[…] }` is also accepted.
 */
export function normalizeSpec(raw: unknown, source: string, fallbackReq?: string): AcceptanceSpec {
  const r = asRecord(raw, source);
  const req = typeof r.req === 'string' && r.req ? r.req : fallbackReq;
  if (!req) throw new AcceptanceParseError(`${source}: spec is missing a requirement key ("req")`);
  const rawCases = Array.isArray(r.cases)
    ? r.cases
    : Array.isArray(r.steps)
      ? [{ name: typeof r.name === 'string' ? r.name : req, steps: r.steps }]
      : null;
  if (!rawCases) throw new AcceptanceParseError(`${source}: spec has no "cases" array (nor a top-level "steps")`);
  const cases: AcceptanceCase[] = rawCases.map((c, i) => {
    const cr = asRecord(c, `${source} case[${i}]`);
    const name = typeof cr.name === 'string' && cr.name ? cr.name : `case ${i + 1}`;
    if (!Array.isArray(cr.steps) || cr.steps.length === 0) {
      throw new AcceptanceParseError(`${source}: case "${name}" has no steps`);
    }
    return { name, steps: cr.steps.map((s, j) => normalizeStep(s, `${source} case "${name}" step[${j}]`)) };
  });
  return { req, cases, source };
}
