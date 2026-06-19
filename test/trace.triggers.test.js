// Dashboard-triggered runs: per-suite, per-requirement (with snapshot/restore sibling preservation).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { filterArg, runSuite, runRequirement } from '../dist/core/trace/triggers.js';
import { parseTraceConfig } from '../dist/core/trace/config.js';

test('filterArg: per-tech tag filter', () => {
  assert.equal(filterArg('playwright', 'PROJ-1'), '--grep "@PROJ-1"');
  assert.equal(filterArg('jest', 'PROJ-1'), '-t "@PROJ-1"');
  assert.equal(filterArg('vitest', 'PROJ-1'), '-t "@PROJ-1"');
  assert.equal(filterArg('node', 'PROJ-1'), '--test-name-pattern "@PROJ-1"');
  assert.equal(filterArg('xunit', 'PROJ-1'), '--filter "req=PROJ-1"');
});

// A fake suite runner: writes only @PROJ-1's testcase when filtered, otherwise both.
const RUNNER =
  'const fs=require("fs");const a=process.argv.slice(2).join(" ");' +
  'const only1=/@PROJ-1/.test(a);' +
  'const c=only1?\'<testcase name="login @PROJ-1"></testcase>\':' +
  '\'<testcase name="login @PROJ-1"></testcase><testcase name="logout @PROJ-2"></testcase>\';' +
  'fs.mkdirSync("e2e/results",{recursive:true});' +
  'fs.writeFileSync("e2e/results/junit.xml",`<testsuites><testsuite>${c}</testsuite></testsuites>`);';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'rtm-trig-'));
  mkdirSync(join(root, 'e2e'), { recursive: true });
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeFileSync(join(root, 'docs', 'requirements.md'), '- [ ] PROJ-1 Login\n- [ ] PROJ-2 Logout');
  writeFileSync(join(root, 'e2e', 'app.spec.ts'), `test('login @PROJ-1', ()=>{}); test('logout @PROJ-2', ()=>{});`);
  writeFileSync(join(root, 'runner.cjs'), RUNNER);
  writeFileSync(
    join(root, 'acp-trace.json'),
    JSON.stringify({
      scopes: [{ requirements: [{ type: 'markdown', path: 'docs/requirements.md' }],
        tests: [{ tech: 'playwright', globs: ['e2e/**/*.spec.ts'], results: ['e2e/results/*.xml'], command: 'node runner.cjs' }] }],
      history: { dir: 'runs' },
    }),
  );
  return root;
}

test('runSuite: runs the suite command and re-traces (both verified)', async () => {
  const root = fixture();
  const cfg = parseTraceConfig(readFileSync(join(root, 'acp-trace.json'), 'utf8'));
  const r = await runSuite(cfg, root, 'playwright');
  const byKey = Object.fromEntries(r.requirements.map((x) => [x.key, x.state]));
  assert.equal(byKey['PROJ-1'], 'verified');
  assert.equal(byKey['PROJ-2'], 'verified');
});

test('runRequirement: updates only the targeted key, preserves the sibling (snapshot/restore)', async () => {
  const root = fixture();
  const cfg = parseTraceConfig(readFileSync(join(root, 'acp-trace.json'), 'utf8'));
  await runSuite(cfg, root, 'playwright'); // seed: both verified, junit has both
  const r = await runRequirement(cfg, root, 'PROJ-1'); // filtered run writes only PROJ-1
  const byKey = Object.fromEntries(r.requirements.map((x) => [x.key, x.state]));
  assert.equal(byKey['PROJ-1'], 'verified'); // freshly re-run
  assert.equal(byKey['PROJ-2'], 'verified'); // NOT lost to the filtered clobber
  // the full results file was restored on disk (still has PROJ-2)
  assert.match(readFileSync(join(root, 'e2e', 'results', 'junit.xml'), 'utf8'), /PROJ-2/);
});
