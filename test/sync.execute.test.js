// Phase 3 step 4-5: executor — push/pull/create/pull-create/conflict/concurrency, preview vs apply.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeAdapter } from '../dist/core/sync/adapters/fake.js';
import { planSync } from '../dist/core/sync/plan.js';
import { executeSync } from '../dist/core/sync/execute.js';
import { listLocalRecords } from '../dist/core/sync/localTasks.js';
import { writeTask, readTask } from '../dist/core/trace/tasks/model.js';

const today = '2026-06-24';
const task = (id, o = {}) => ({ id, title: id, status: 'todo', requirements: [], tests: [], assignee: null, source: 'local', created: today, updated: today, body: 'b', ...o });
const rec = (o = {}) => ({ title: 'Login', body: 'do it', status: 'todo', labels: ['auth'], ...o });

function setup(tasks) {
  const baseDir = mkdtempSync(join(tmpdir(), 'sync-exec-'));
  const tasksRoot = join(baseDir, '.acp', 'tasks');
  for (const t of tasks) writeTask(tasksRoot, t);
  return { baseDir, tasksRoot };
}
const opts = (baseDir, tasksRoot, apply, direction = 'both') => ({ baseDir, bindingId: 'tasks-github', tasksRoot, idPrefix: 'TASK', today, apply, direction });

async function run(baseDir, tasksRoot, adapter, state, apply, direction) {
  const locals = listLocalRecords(baseDir, tasksRoot);
  const remotes = await adapter.list();
  const plan = planSync(locals, remotes, state);
  return executeSync(plan, adapter, state, opts(baseDir, tasksRoot, apply, direction));
}

test('create-remote: a new local task creates + links an issue, re-baselines', async () => {
  const { baseDir, tasksRoot } = setup([task('TASK-1', { title: 'Login', body: 'do it', labels: ['auth'] })]);
  const adapter = new FakeAdapter();
  const state = {};
  const r = await run(baseDir, tasksRoot, adapter, state, true);
  assert.equal(r.summary['create-remote'], 1);
  assert.equal(r.links.length, 1);
  const issueId = r.links[0].remoteId;
  assert.equal((await adapter.list()).length, 1);
  // the task got linked
  assert.equal(readTask(join(tasksRoot, 'TASK-1.md')).remoteId, issueId);
  // re-running is now a no-op (skip)
  const r2 = await run(baseDir, tasksRoot, adapter, state, true);
  assert.equal(r2.summary.skip, 1);
  assert.equal(r2.summary['create-remote'], 0);
});

test('pull-create: a new remote issue creates a local task', async () => {
  const { baseDir, tasksRoot } = setup([]);
  const adapter = new FakeAdapter([{ id: 'ISSUE-9', rev: 'r1', fields: rec({ title: 'From issue' }) }]);
  const state = {};
  const r = await run(baseDir, tasksRoot, adapter, state, true);
  assert.equal(r.summary['pull-create'], 1);
  assert.equal(listLocalRecords(baseDir, tasksRoot).length, 1);
  assert.equal(listLocalRecords(baseDir, tasksRoot)[0].record.title, 'From issue');
});

test('preview (apply=false) writes nothing', async () => {
  const { baseDir, tasksRoot } = setup([task('TASK-1', { title: 'Login' })]);
  const adapter = new FakeAdapter();
  const state = {};
  const r = await run(baseDir, tasksRoot, adapter, state, false);
  assert.equal(r.applied, false);
  assert.equal(r.summary['create-remote'], 1); // would create
  assert.equal((await adapter.list()).length, 0); // but didn't
  assert.deepEqual(state, {}); // state untouched
});

test('push then a divergent remote edit → conflict file, nothing clobbered', async () => {
  const { baseDir, tasksRoot } = setup([task('TASK-1', { title: 'Login', body: 'do it', labels: ['auth'] })]);
  const adapter = new FakeAdapter();
  const state = {};
  await run(baseDir, tasksRoot, adapter, state, true); // create + link
  const issueId = Object.values(state)[0].remoteId;

  // both sides change differently
  writeTask(tasksRoot, { ...readTask(join(tasksRoot, 'TASK-1.md')), title: 'Login LOCAL' });
  adapter.editRemote(issueId, { title: 'Login REMOTE' });

  const r = await run(baseDir, tasksRoot, adapter, state, true);
  assert.equal(r.conflicts.length, 1);
  assert.deepEqual(r.conflicts[0].fields, ['title']);
  assert.ok(existsSync(r.conflicts[0].file));
  assert.match(readFileSync(r.conflicts[0].file, 'utf8'), /Login LOCAL[\s\S]*Login REMOTE/);
  // neither side overwritten
  assert.equal(readTask(join(tasksRoot, 'TASK-1.md')).title, 'Login LOCAL');
  assert.equal((await adapter.get(issueId)).fields.title, 'Login REMOTE');
});

test('safe-both: local-only pushes, remote-only pulls, in one run', async () => {
  const { baseDir, tasksRoot } = setup([task('TASK-1', { title: 'A' }), task('TASK-2', { title: 'B' })]);
  const adapter = new FakeAdapter();
  const state = {};
  await run(baseDir, tasksRoot, adapter, state, true); // link both
  const idA = state['.acp/tasks/TASK-1.md'].remoteId;
  const idB = state['.acp/tasks/TASK-2.md'].remoteId;

  writeTask(tasksRoot, { ...readTask(join(tasksRoot, 'TASK-1.md')), title: 'A-local' }); // local change
  adapter.editRemote(idB, { title: 'B-remote' }); // remote change

  const r = await run(baseDir, tasksRoot, adapter, state, true);
  assert.equal(r.summary.push, 1);
  assert.equal(r.summary.pull, 1);
  assert.equal((await adapter.get(idA)).fields.title, 'A-local'); // pushed
  assert.equal(readTask(join(tasksRoot, 'TASK-2.md')).title, 'B-remote'); // pulled
});

test('direction push-only: a remote-only change is not pulled', async () => {
  const { baseDir, tasksRoot } = setup([task('TASK-1', { title: 'A' })]);
  const adapter = new FakeAdapter();
  const state = {};
  await run(baseDir, tasksRoot, adapter, state, true);
  const id = state['.acp/tasks/TASK-1.md'].remoteId;
  adapter.editRemote(id, { title: 'A-remote' });
  const r = await run(baseDir, tasksRoot, adapter, state, true, 'push');
  assert.equal(readTask(join(tasksRoot, 'TASK-1.md')).title, 'A'); // not pulled (push-only)
});
