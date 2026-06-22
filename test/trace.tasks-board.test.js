// Phase 1 step 6: board renderer — columns by status, drift marker, summary, other-status column.
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { renderBoard, boardPath } from '../dist/core/trace/tasks/board.js';
import { acpDir } from '../dist/core/trace/store.js';

const resolved = { mode: 'local', dir: '.acp/tasks', idPrefix: 'TASK', statuses: ['todo', 'in-progress', 'done'], doneStatuses: ['done'], verifyDone: true, driftRule: 'unverified' };
const v = (id, status, opts = {}) => ({
  task: { id, title: opts.title ?? id, status, requirements: opts.requirements ?? [], tests: [], assignee: null, source: 'local', created: '', updated: '', body: '' },
  done: status === 'done',
  drift: opts.drift ?? false,
  reason: opts.reason ?? null,
  requirements: [],
});

test('boardPath = .acp/BOARD.md', () => {
  assert.equal(boardPath('/repo'), join(acpDir('/repo'), 'BOARD.md'));
});

test('renders a column per configured status with counts + summary', () => {
  const md = renderBoard([v('TASK-1', 'todo'), v('TASK-2', 'in-progress'), v('TASK-3', 'done')], resolved);
  assert.match(md, /^# Task Board/);
  assert.match(md, /3 task\(s\) · 1 done · 0 ⚠️ drift/);
  assert.match(md, /## todo \(1\)[\s\S]*\*\*TASK-1\*\*/);
  assert.match(md, /## in-progress \(1\)/);
  assert.match(md, /## done \(1\)[\s\S]*\*\*TASK-3\*\* TASK-3 ✅/); // done gets a tick
});

test('empty column shows (none)', () => {
  const md = renderBoard([v('TASK-1', 'todo')], resolved);
  assert.match(md, /## in-progress \(0\)\n\n_\(none\)_/);
});

test('drifted done task → ⚠️ marker + reason, and counted in summary', () => {
  const md = renderBoard([v('TASK-9', 'done', { drift: true, reason: 'marked done but not verified: PROJ-9 (failing)', requirements: ['PROJ-9'] })], resolved);
  assert.match(md, /1 done · 1 ⚠️ drift/);
  assert.match(md, /⚠️ \*\*TASK-9\*\* TASK-9 · PROJ-9 — marked done but not verified/);
});

test('requirements listed; status outside the configured set → (other) column', () => {
  const md = renderBoard([v('TASK-1', 'todo', { requirements: ['PROJ-1', 'PROJ-2'] }), v('JIRA-1', 'In Review')], resolved);
  assert.match(md, /\*\*TASK-1\*\* TASK-1 · PROJ-1, PROJ-2/);
  assert.match(md, /## \(other\) \(1\)[\s\S]*\*\*JIRA-1\*\*/);
});
