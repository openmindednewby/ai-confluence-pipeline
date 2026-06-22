// Phase 1 step 1: the `tasks` config block + scopes[].taskPrefix + resolveTasksConfig.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTraceConfig, resolveTasksConfig, scopeTaskPrefix, DEFAULT_TASKS_CONFIG } from '../dist/core/trace/config.js';

const base = { scopes: [{ requirements: [{ type: 'markdown', path: 'r.md' }], tests: [] }] };

test('resolveTasksConfig: defaults when tasks block is absent', () => {
  const config = parseTraceConfig(JSON.stringify(base));
  assert.deepEqual(resolveTasksConfig(config), DEFAULT_TASKS_CONFIG);
  assert.equal(DEFAULT_TASKS_CONFIG.mode, 'local');
  assert.equal(DEFAULT_TASKS_CONFIG.driftRule, 'unverified');
  assert.equal(DEFAULT_TASKS_CONFIG.dir, '.acp/tasks');
});

test('resolveTasksConfig: overrides merge over defaults', () => {
  const config = parseTraceConfig(JSON.stringify({
    ...base,
    tasks: { mode: 'jira', statuses: ['open', 'doing', 'shipped'], doneStatuses: ['shipped'], driftRule: 'failing', jira: { epic: 'PROJ-1' } },
  }));
  const r = resolveTasksConfig(config);
  assert.equal(r.mode, 'jira');
  assert.deepEqual(r.statuses, ['open', 'doing', 'shipped']);
  assert.deepEqual(r.doneStatuses, ['shipped']);
  assert.equal(r.driftRule, 'failing');
  assert.deepEqual(r.jira, { epic: 'PROJ-1' });
  assert.equal(r.idPrefix, 'TASK'); // untouched field keeps default
});

test('config: doneStatuses must be a subset of statuses', () => {
  assert.throws(
    () => parseTraceConfig(JSON.stringify({ ...base, tasks: { statuses: ['todo', 'done'], doneStatuses: ['shipped'] } })),
    /doneStatuses must all be members/,
  );
  // subset is fine
  assert.doesNotThrow(() => parseTraceConfig(JSON.stringify({ ...base, tasks: { statuses: ['todo', 'done'], doneStatuses: ['done'] } })));
});

test('config: invalid mode / driftRule rejected', () => {
  assert.throws(() => parseTraceConfig(JSON.stringify({ ...base, tasks: { mode: 'nope' } })), /tasks\.mode|invalid/i);
  assert.throws(() => parseTraceConfig(JSON.stringify({ ...base, tasks: { driftRule: 'whenever' } })), /driftRule|invalid/i);
});

test('scopeTaskPrefix: per-scope override else global', () => {
  const config = parseTraceConfig(JSON.stringify({
    scopes: [
      { name: 'web', taskPrefix: 'WEB', requirements: [{ type: 'markdown', path: 'r.md' }], tests: [] },
      { name: 'core', requirements: [{ type: 'markdown', path: 'r.md' }], tests: [] },
    ],
    tasks: { idPrefix: 'KAT' },
  }));
  const r = resolveTasksConfig(config);
  assert.equal(scopeTaskPrefix(r, config.scopes[0]), 'WEB'); // scope override
  assert.equal(scopeTaskPrefix(r, config.scopes[1]), 'KAT'); // falls back to global idPrefix
  assert.equal(scopeTaskPrefix(r), 'KAT'); // no scope → global
});
