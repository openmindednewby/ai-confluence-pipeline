// Code-side gap signal: scan implementation code for @KEY tags → inCode + implementation gaps.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanCodeKeys, markImplemented } from '../dist/core/trace/codeScan.js';
import { computeReport } from '../dist/core/trace/computeState.js';
import { runTrace } from '../dist/core/trace/index.js';
import { parseTraceConfig } from '../dist/core/trace/config.js';

test('scanCodeKeys: finds @KEY tags in code globs', () => {
  const root = mkdtempSync(join(tmpdir(), 'rtm-code-'));
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src', 'auth.ts'), '// @PROJ-1 login\nexport function login(){}\n// covers @PROJ-3\n');
  const keys = scanCodeKeys(root, ['src/**/*.ts'], '[A-Z][A-Z0-9]+-\\d+');
  assert.ok(keys.has('PROJ-1') && keys.has('PROJ-3'));
  assert.ok(!keys.has('PROJ-2'));
  assert.equal(scanCodeKeys(root, [], 'X').size, 0); // no globs → empty
});

test('markImplemented: sets inCode + implemented stat (null when not scanned)', () => {
  const report = computeReport({
    requirements: [
      { key: 'PROJ-1', title: 'A', declaredStatus: null, declaredComplete: false, source: 'markdown' },
      { key: 'PROJ-2', title: 'B', declaredStatus: null, declaredComplete: false, source: 'markdown' },
    ],
    refs: [], ingested: { byKey: new Map(), occurrences: [] },
    git: { sha: null, shortSha: null, branch: null, dirty: false, committedAt: null },
    generatedAt: '2026-06-20T00:00:00Z',
  });
  markImplemented(report, new Set(['PROJ-1']), true);
  assert.equal(report.requirements.find((r) => r.key === 'PROJ-1').inCode, true);
  assert.equal(report.requirements.find((r) => r.key === 'PROJ-2').inCode, false);
  assert.equal(report.stats.implemented, 1);
  // not scanned → null, implemented 0
  markImplemented(report, new Set(), false);
  assert.equal(report.requirements[0].inCode, null);
  assert.equal(report.stats.implemented, 0);
});

test('runTrace with code globs: requirement not in code → inCode false', async () => {
  const root = mkdtempSync(join(tmpdir(), 'rtm-code2-'));
  mkdirSync(join(root, 'src'), { recursive: true });
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeFileSync(join(root, 'docs', 'requirements.md'), '- [ ] PROJ-1 Login\n- [ ] PROJ-2 Logout');
  writeFileSync(join(root, 'src', 'auth.ts'), '// @PROJ-1\nexport const x = 1;');
  const config = parseTraceConfig(JSON.stringify({
    scopes: [{ requirements: [{ type: 'markdown', path: 'docs/requirements.md' }], tests: [], code: ['src/**/*.ts'] }],
  }));
  const report = await runTrace(config, root, { save: false });
  const byKey = Object.fromEntries(report.requirements.map((r) => [r.key, r.inCode]));
  assert.equal(byKey['PROJ-1'], true);
  assert.equal(byKey['PROJ-2'], false); // declared but not in code = implementation gap
  assert.equal(report.stats.implemented, 1);
});
