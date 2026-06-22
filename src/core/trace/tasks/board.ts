/**
 * Board renderer — a markdown kanban grouped by status column, with the ⚠️ drift marker on
 * done-but-unproven tasks. Pure render; the CLI writes it to `.acp/BOARD.md` on demand.
 */
import { join } from 'node:path';
import type { ResolvedTasksConfig } from '../config.js';
import { acpDir } from '../store.js';
import { summarizeDrift, type TaskVerification } from './verify.js';

/** Default board path: `.acp/BOARD.md`. */
export function boardPath(baseDir: string): string {
  return join(acpDir(baseDir), 'BOARD.md');
}

function taskLine(v: TaskVerification): string {
  const reqs = v.task.requirements.length ? ` · ${v.task.requirements.join(', ')}` : '';
  if (v.drift) return `- ⚠️ **${v.task.id}** ${v.task.title}${reqs} — ${v.reason}`;
  const tick = v.done ? ' ✅' : '';
  return `- **${v.task.id}** ${v.task.title}${reqs}${tick}`;
}

function column(lines: string[], heading: string, items: TaskVerification[]): void {
  lines.push(`## ${heading} (${items.length})`, '');
  if (!items.length) lines.push('_(none)_', '');
  else {
    for (const v of items) lines.push(taskLine(v));
    lines.push('');
  }
}

export interface BoardOptions {
  title?: string;
}

/** Render the board markdown from pre-computed verifications (one column per configured status). */
export function renderBoard(verifications: TaskVerification[], resolved: ResolvedTasksConfig, opts: BoardOptions = {}): string {
  const sum = summarizeDrift(verifications);
  const lines: string[] = [
    `# ${opts.title ?? 'Task Board'}`,
    '',
    `_${sum.total} task(s) · ${sum.done} done · ${sum.drift} ⚠️ drift._`,
    '',
  ];

  for (const status of resolved.statuses) {
    column(lines, status, verifications.filter((v) => v.task.status === status));
  }

  // Tasks whose status isn't in the configured set (e.g. a Jira-imported status) — never hide them.
  const known = new Set(resolved.statuses);
  const other = verifications.filter((v) => !known.has(v.task.status));
  if (other.length) column(lines, '(other)', other);

  return `${lines.join('\n').trim()}\n`;
}
