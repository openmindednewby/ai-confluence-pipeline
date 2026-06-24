// Web wizard slice 5: /api/sync runs the reconciler (injected fake adapter) — preview vs apply + not-configured.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWebServer } from '../dist/core/web/server.js';
import { FakeAdapter } from '../dist/core/sync/adapters/fake.js';
import { writeTask } from '../dist/core/trace/tasks/model.js';

const today = '2026-06-24';
function repoWithSync() {
  const dir = mkdtempSync(join(tmpdir(), 'web-sync-'));
  writeFileSync(join(dir, 'acp-trace.json'), JSON.stringify({
    scopes: [{ requirements: [{ type: 'markdown', path: '.acp/requirements/index.md' }] }],
    sync: { bindings: [{ id: 'tasks-gh', statusMap: { todo: 'open', done: 'closed' }, remote: { type: 'github', repo: 'o/r' } }] },
  }));
  writeTask(join(dir, '.acp', 'tasks'), { id: 'TASK-1', title: 'Login', status: 'todo', requirements: [], tests: [], assignee: null, source: 'local', created: today, updated: today, body: 'b' });
  return dir;
}

test('POST /api/sync preview: reports would-create, writes nothing', async () => {
  const dir = repoWithSync();
  const adapter = new FakeAdapter();
  const s = await startWebServer({ baseDir: dir, port: 0, syncAdapters: { 'tasks-gh': adapter } });
  try {
    const res = await fetch(s.url + '/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apply: false }) });
    const d = await res.json();
    assert.equal(d.configured, true);
    assert.equal(d.applied, false);
    assert.equal(d.results[0].summary['create-remote'], 1);
    assert.equal((await adapter.list()).length, 0); // preview wrote nothing
  } finally {
    await s.close();
  }
});

test('POST /api/sync apply: creates the issue (status mapped), links it', async () => {
  const dir = repoWithSync();
  const adapter = new FakeAdapter();
  const s = await startWebServer({ baseDir: dir, port: 0, syncAdapters: { 'tasks-gh': adapter } });
  try {
    const res = await fetch(s.url + '/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apply: true }) });
    const d = await res.json();
    assert.equal(d.applied, true);
    assert.equal(d.results[0].summary['create-remote'], 1);
    assert.equal(d.results[0].links.length, 1);
    assert.equal((await adapter.list()).length, 1); // issue created
  } finally {
    await s.close();
  }
});

test('POST /api/sync without a sync block → configured:false (friendly guidance)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'web-sync-none-')); // no acp-trace.json → synthesised config (no sync)
  const s = await startWebServer({ baseDir: dir, port: 0 });
  try {
    const res = await fetch(s.url + '/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apply: false }) });
    const d = await res.json();
    assert.equal(res.status, 200);
    assert.equal(d.configured, false);
    assert.match(d.message, /sync block|acp-trace/i);
  } finally {
    await s.close();
  }
});

import { conflictPath, saveState, syncStatePath } from '../dist/core/sync/state.js';
import { planSync } from '../dist/core/sync/plan.js';
import { executeSync } from '../dist/core/sync/execute.js';
import { listLocalRecords } from '../dist/core/sync/localTasks.js';
import { existsSync } from 'node:fs';

test('POST /api/sync/resolve: take local clears the conflict', async () => {
  const dir = repoWithSync();
  // make a title-only conflict
  writeTask(join(dir, '.acp', 'tasks'), { id: 'TASK-1', title: 'LOCAL', status: 'todo', requirements: [], tests: [], assignee: null, source: 'local', created: today, updated: today, body: 'b' });
  const adapter = new FakeAdapter([{ id: 'I1', rev: 'r1', fields: { title: 'REMOTE', body: 'b', status: 'open', labels: [] } }]);
  const state = { '.acp/tasks/TASK-1.md': { remoteId: 'I1', remoteRev: 'r1', base: { title: 'BASE', body: 'b', status: 'open', labels: [] } } };
  const plan = planSync(listLocalRecords(join(dir), join(dir, '.acp', 'tasks')), await adapter.list(), state);
  await executeSync(plan, adapter, state, { baseDir: dir, bindingId: 'tasks-gh', tasksRoot: join(dir, '.acp', 'tasks'), idPrefix: 'TASK', today, apply: true, direction: 'both' });
  saveState(syncStatePath(dir), { version: 1, bindings: { 'tasks-gh': { records: state } } });
  assert.ok(existsSync(conflictPath(dir, 'tasks-gh', 'I1')));

  const s = await startWebServer({ baseDir: dir, port: 0, syncAdapters: { 'tasks-gh': adapter } });
  try {
    const res = await fetch(s.url + '/api/sync/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'TASK-1', take: 'local' }) });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).take, 'local');
    assert.equal(existsSync(conflictPath(dir, 'tasks-gh', 'I1')), false);
  } finally {
    await s.close();
  }
});
