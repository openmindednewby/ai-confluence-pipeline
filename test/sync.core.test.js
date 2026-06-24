// Phase 3 step 1: sync core — record model + 3-way classifier + state store + Task labels round-trip.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonical, recordsEqual } from '../dist/core/sync/model.js';
import { classify, changedFields } from '../dist/core/sync/classify.js';
import { loadState, saveState, emptyState, bindingRecords, syncStatePath, conflictPath } from '../dist/core/sync/state.js';
import { serializeTask, parseTask } from '../dist/core/trace/tasks/model.js';

const rec = (o = {}) => ({ title: 'Login', body: 'do it', status: 'todo', labels: ['auth'], ...o });

// ── model ──────────────────────────────────────────────────────────────────────────────────

test('canonical: trims + sorts/dedupes labels', () => {
  const c = canonical({ title: ' A ', body: ' b ', status: 'todo', labels: ['z', 'a', 'a', ' '] });
  assert.equal(c.title, 'A');
  assert.deepEqual(c.labels, ['a', 'z']);
});

test('recordsEqual: order-insensitive labels, trim-insensitive text', () => {
  assert.equal(recordsEqual(rec({ labels: ['auth'] }), rec({ labels: ['auth'] })), true);
  assert.equal(recordsEqual(rec({ labels: ['a', 'b'] }), rec({ labels: ['b', 'a'] })), true);
  assert.equal(recordsEqual(rec({ title: 'Login ' }), rec({ title: 'Login' })), true);
  assert.equal(recordsEqual(rec({ status: 'done' }), rec({ status: 'todo' })), false);
});

// ── classifier (the safety core) ─────────────────────────────────────────────────────────────

test('classify: skip / push / pull / converged / conflict', () => {
  const base = rec();
  assert.equal(classify(base, rec(), rec()), 'skip');
  assert.equal(classify(base, rec({ title: 'Login v2' }), rec()), 'push');
  assert.equal(classify(base, rec(), rec({ title: 'Login v2' })), 'pull');
  assert.equal(classify(base, rec({ status: 'done' }), rec({ status: 'done' })), 'converged'); // same change both sides
  assert.equal(classify(base, rec({ title: 'L-local' }), rec({ title: 'L-remote' })), 'conflict');
});

test('changedFields: reports which fields differ', () => {
  assert.deepEqual(changedFields(rec(), rec({ status: 'done', labels: ['auth', 'x'] })).sort(), ['labels', 'status']);
  assert.deepEqual(changedFields(rec(), rec()), []);
});

// ── state store ────────────────────────────────────────────────────────────────────────────

test('state: save → load round-trip + bindingRecords', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sync-state-'));
  const path = syncStatePath(dir);
  const st = emptyState();
  bindingRecords(st, 'tasks-github')['.acp/tasks/TASK-1.md'] = { remoteId: '5', remoteRev: 'r1', base: rec() };
  saveState(path, st);
  assert.ok(existsSync(path));
  const back = loadState(path);
  assert.equal(back.bindings['tasks-github'].records['.acp/tasks/TASK-1.md'].remoteId, '5');
});

test('state: load missing file → empty', () => {
  assert.deepEqual(loadState(join(mkdtempSync(join(tmpdir(), 'sync-empty-')), 'nope.json')), emptyState());
});

test('conflictPath: sanitises the id', () => {
  assert.match(conflictPath('/base', 'tasks-jira', 'PROJ-12'), /conflicts[\\/]tasks-jira[\\/]PROJ-12\.md$/);
});

// ── Task labels (optional, conditionally serialized) ──────────────────────────────────────────

test('Task labels: omitted when absent, round-tripped when present', () => {
  const noLabels = { id: 'TASK-1', title: 'X', status: 'todo', requirements: [], tests: [], assignee: null, source: 'local', created: '2026-06-24', updated: '2026-06-24', body: 'b' };
  assert.equal(/labels:/.test(serializeTask(noLabels)), false); // not emitted
  assert.deepEqual(parseTask(serializeTask(noLabels)), noLabels); // no labels key added

  const withLabels = { ...noLabels, labels: ['auth', 'api'] };
  assert.match(serializeTask(withLabels), /labels: \[auth, api\]/);
  assert.deepEqual(parseTask(serializeTask(withLabels)), withLabels);
});
