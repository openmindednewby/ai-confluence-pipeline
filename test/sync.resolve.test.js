// Phase 3 v3: interactive conflict resolution — take local / take remote, clears the file, re-baselines.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeAdapter } from '../dist/core/sync/adapters/fake.js';
import { planSync } from '../dist/core/sync/plan.js';
import { executeSync } from '../dist/core/sync/execute.js';
import { resolveConflict, listConflicts } from '../dist/core/sync/sync.js';
import { listLocalRecords } from '../dist/core/sync/localTasks.js';
import { writeTask, readTask } from '../dist/core/trace/tasks/model.js';
import { conflictPath } from '../dist/core/sync/state.js';
import { parseTraceConfig } from '../dist/core/trace/config.js';

const today = '2026-06-24';
const rec = (o = {}) => ({ title: 'Login', body: 'do it', status: 'todo', labels: [], ...o });

const config = parseTraceConfig(JSON.stringify({
  scopes: [{ requirements: [{ type: 'markdown', path: 'r.md' }] }],
  // identity status map so the resolve mapper matches the identity-mapped test setup (conflict is title-only)
  sync: { bindings: [{ id: 'b', statusMap: { todo: 'todo', 'in-progress': 'in-progress', done: 'done' }, remote: { type: 'github', repo: 'o/r' } }] },
}));

/** Set up a flagged conflict: both sides changed the title differently. Returns {baseDir, adapter, state}. */
async function conflicted() {
  const baseDir = mkdtempSync(join(tmpdir(), 'sync-resolve-'));
  const tasksRoot = join(baseDir, '.acp', 'tasks');
  writeTask(tasksRoot, { id: 'TASK-1', title: 'Login LOCAL', status: 'todo', requirements: [], tests: [], assignee: null, source: 'local', created: today, updated: today, body: 'do it' });
  const adapter = new FakeAdapter([{ id: 'I1', rev: 'r1', fields: rec({ title: 'Login REMOTE' }) }]);
  const state = { '.acp/tasks/TASK-1.md': { remoteId: 'I1', remoteRev: 'r1', base: rec() } };
  const opts = { baseDir, bindingId: 'b', tasksRoot, idPrefix: 'TASK', today, apply: true, direction: 'both' };
  const plan = planSync(listLocalRecords(baseDir, tasksRoot), await adapter.list(), state);
  const res = await executeSync(plan, adapter, state, opts);
  assert.equal(res.conflicts.length, 1); // flagged
  // persist state for resolve to load
  const { saveState, syncStatePath } = await import('../dist/core/sync/state.js');
  saveState(syncStatePath(baseDir), { version: 1, bindings: { b: { records: state } } });
  return { baseDir, tasksRoot, adapter };
}

test('listConflicts: lists the flagged conflict file', async () => {
  const { baseDir } = await conflicted();
  const conflicts = listConflicts(baseDir);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].binding, 'b');
});

test('resolve take local: pushes local to remote, clears the conflict, re-baselines', async () => {
  const { baseDir, adapter } = await conflicted();
  const r = await resolveConflict(config, baseDir, { id: 'TASK-1', take: 'local', adapters: { b: adapter }, today });
  assert.equal(r.take, 'local');
  assert.equal((await adapter.get('I1')).fields.title, 'Login LOCAL'); // remote now matches local
  assert.equal(existsSync(conflictPath(baseDir, 'b', 'I1')), false); // file cleared
  assert.equal(listConflicts(baseDir).length, 0);
});

test('resolve take remote: writes remote to local, clears the conflict', async () => {
  const { baseDir, tasksRoot, adapter } = await conflicted();
  const r = await resolveConflict(config, baseDir, { id: 'I1', take: 'remote', adapters: { b: adapter }, today }); // by remote id
  assert.equal(r.take, 'remote');
  assert.equal(readTask(join(tasksRoot, 'TASK-1.md')).title, 'Login REMOTE'); // local now matches remote
  assert.equal(listConflicts(baseDir).length, 0);
});

test('resolve: after resolving, a fresh sync is clean (no conflict)', async () => {
  const { baseDir, tasksRoot, adapter } = await conflicted();
  await resolveConflict(config, baseDir, { id: 'TASK-1', take: 'local', adapters: { b: adapter }, today });
  // re-load state + run a plan: should be skip now
  const { loadState, syncStatePath } = await import('../dist/core/sync/state.js');
  const state = loadState(syncStatePath(baseDir)).bindings.b.records;
  const plan = planSync(listLocalRecords(baseDir, tasksRoot), await adapter.list(), state);
  assert.equal(plan.items[0].action, 'skip');
});
