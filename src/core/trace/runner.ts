/**
 * Optional test execution. When a test-source group declares a `command`, `acp trace --run` executes
 * it (in `cwd`, via the shell) so the suite re-produces its JUnit/TRX files before they're ingested.
 * A non-zero exit does NOT abort the trace — the resulting failures show up in the report on their own.
 */
import { spawn, spawnSync } from 'node:child_process';
import { isAbsolute, resolve } from 'node:path';

const DEFAULT_TIMEOUT_MS = 600_000; // 10 min per suite
const MAX_OUTPUT = 4_000; // keep captured output bounded

/** One runnable test group. */
export interface RunnableSpec {
  tech: string;
  command?: string;
  cwd?: string;
}

/** Outcome of executing one suite command. */
export interface CommandRun {
  tech: string;
  command: string;
  cwd: string;
  exitCode: number | null;
  ok: boolean;
  durationMs: number;
  /** Tail of combined stdout+stderr, truncated. */
  output: string;
}

/** Execute one suite command and capture a bounded outcome. */
export function runCommand(spec: RunnableSpec & { command: string }, repoDir: string, now: () => number): CommandRun {
  const cwd = spec.cwd ? (isAbsolute(spec.cwd) ? spec.cwd : resolve(repoDir, spec.cwd)) : repoDir;
  const started = now();
  const res = spawnSync(spec.command, {
    cwd,
    shell: true,
    encoding: 'utf8',
    timeout: DEFAULT_TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024,
  });
  const combined = `${res.stdout ?? ''}${res.stderr ?? ''}`;
  return {
    tech: spec.tech,
    command: spec.command,
    cwd,
    exitCode: res.status,
    ok: res.status === 0,
    durationMs: now() - started,
    output: combined.length > MAX_OUTPUT ? `…${combined.slice(-MAX_OUTPUT)}` : combined,
  };
}

/** Run every spec that has a command. Specs without a command are skipped (ingest-only). */
export function runCommands(
  specs: RunnableSpec[],
  repoDir: string,
  now: () => number = () => Date.now(),
): CommandRun[] {
  return specs
    .filter((s): s is RunnableSpec & { command: string } => Boolean(s.command))
    .map((s) => runCommand(s, repoDir, now));
}

/**
 * Async, non-blocking variant that streams output line-by-line via `onLine` (so the portal can show
 * live status without freezing the server, which `spawnSync` would). Resolves with the outcome.
 */
export function runCommandStream(
  spec: RunnableSpec & { command: string },
  repoDir: string,
  onLine?: (line: string) => void,
  now: () => number = () => Date.now(),
): Promise<CommandRun> {
  const cwd = spec.cwd ? (isAbsolute(spec.cwd) ? spec.cwd : resolve(repoDir, spec.cwd)) : repoDir;
  const started = now();
  return new Promise((resolveP) => {
    let out = '';
    let buf = '';
    const child = spawn(spec.command, { cwd, shell: true });
    const timer = setTimeout(() => child.kill(), DEFAULT_TIMEOUT_MS);
    const onData = (d: Buffer) => {
      const s = d.toString();
      out += s;
      if (onLine) {
        buf += s;
        const lines = buf.split(/\r?\n/);
        buf = lines.pop() ?? '';
        for (const l of lines) onLine(l);
      }
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    const finish = (exitCode: number | null) => {
      clearTimeout(timer);
      if (onLine && buf) onLine(buf);
      resolveP({
        tech: spec.tech,
        command: spec.command,
        cwd,
        exitCode,
        ok: exitCode === 0,
        durationMs: now() - started,
        output: out.length > MAX_OUTPUT ? `…${out.slice(-MAX_OUTPUT)}` : out,
      });
    };
    child.on('close', (code) => finish(code));
    child.on('error', () => finish(null));
  });
}

/** Async run of every spec that has a command, streaming output through `onLine`. */
export async function execCommands(
  specs: RunnableSpec[],
  repoDir: string,
  onLine?: (line: string) => void,
): Promise<CommandRun[]> {
  const out: CommandRun[] = [];
  for (const s of specs) {
    if (!s.command) continue;
    out.push(await runCommandStream({ ...s, command: s.command }, repoDir, onLine));
  }
  return out;
}
