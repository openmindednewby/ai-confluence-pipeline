// Pluggable: the `command` requirement source (run any script → requirements) + init --profile presets.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCommandRequirements } from '../dist/core/trace/requirements/command.js';
import { autodetect, PROFILE_NAMES } from '../dist/core/trace/autodetect.js';
import { traceConfigSchema } from '../dist/core/trace/config.js';

test('command source: JSON stdout → requirements', () => {
  const root = mkdtempSync(join(tmpdir(), 'rtm-cmd-'));
  writeFileSync(join(root, 'req.js'), `console.log(JSON.stringify([{key:'REQ-1',title:'Login',status:'Done'},{key:'REQ-2',title:'Logout',status:'To Do'}]))`);
  const reqs = runCommandRequirements({ command: 'node req.js' }, root);
  assert.deepEqual(reqs.map((r) => r.key), ['REQ-1', 'REQ-2']);
  assert.equal(reqs[0].declaredComplete, true); // status "Done"
  assert.equal(reqs[1].declaredComplete, false);
  assert.equal(reqs[0].source, 'command');
});

test('command source: markdown stdout → requirements', () => {
  const root = mkdtempSync(join(tmpdir(), 'rtm-cmd2-'));
  writeFileSync(join(root, 'req.js'), `console.log('- [x] REQ-9 Done one\\n- [ ] REQ-10 Pending one')`);
  const reqs = runCommandRequirements({ command: 'node req.js', format: 'markdown' }, root);
  assert.deepEqual(reqs.map((r) => r.key), ['REQ-9', 'REQ-10']);
  assert.equal(reqs[0].declaredComplete, true);
});

test('command source: a failing command throws', () => {
  const root = mkdtempSync(join(tmpdir(), 'rtm-cmd3-'));
  assert.throws(() => runCommandRequirements({ command: 'node -e "process.exit(2)"' }, root), /command failed/);
});

test('autodetect: detects code globs from common source dirs (pipeline-ready config)', () => {
  const root = mkdtempSync(join(tmpdir(), 'rtm-code-detect-'));
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src', 'app.ts'), 'export const x = 1;');
  const plan = autodetect(root);
  assert.ok(Array.isArray(plan.config.scopes[0].code));
  assert.ok(plan.config.scopes[0].code.some((g) => g.startsWith('src/**')));
});

test('autodetect --profile presets the requirement source; unknown throws', () => {
  const root = mkdtempSync(join(tmpdir(), 'rtm-prof-'));
  for (const name of PROFILE_NAMES) {
    const plan = autodetect(root, 'X', name);
    assert.doesNotThrow(() => traceConfigSchema.parse(plan.config)); // every profile yields a valid config
  }
  assert.equal(autodetect(root, 'X', 'github').config.scopes[0].requirements[0].type, 'github-issues');
  assert.equal(autodetect(root, 'X', 'command').config.scopes[0].requirements[0].type, 'command');
  assert.throws(() => autodetect(root, 'X', 'nope'), /unknown profile/);
});
