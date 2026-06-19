// RTM portal: page injection (pure) + a live server integration test (start → fetch → POST → close).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { portalPage, serve } from '../dist/core/trace/serve.js';
import { computeReport } from '../dist/core/trace/computeState.js';

function demoReport() {
  return computeReport({
    requirements: [{ key: 'PROJ-1', title: 'Login', declaredStatus: 'Done', declaredComplete: true, source: 'markdown' }],
    refs: [{ key: 'PROJ-1', file: 'a.spec.ts', title: 'login', tech: 'playwright', via: 'tag' }],
    ingested: { byKey: new Map([['PROJ-1', { passed: 1, failed: 0, skipped: 0, lastRun: null }]]), occurrences: [] },
    git: { sha: null, shortSha: null, branch: null, dirty: false, committedAt: null },
    generatedAt: '2026-06-19T00:00:00Z',
    project: 'P',
  });
}

test('portalPage injects the Run button, suites checkbox, and history', () => {
  const html = portalPage(demoReport(), ['2026-06-19T00-00-00-000Z_abc.json']);
  assert.match(html, /id="rtm-run"/);
  assert.match(html, /id="rtm-suites"/);
  assert.match(html, /History \(1\)/);
  assert.match(html, /2026-06-19T00-00-00-000Z_abc\.json/);
  assert.match(html, /^<!doctype html>/);
});

test('serve: live server answers /api/report, /api/runs, and POST /run', async () => {
  const root = mkdtempSync(join(tmpdir(), 'rtm-serve-'));
  mkdirSync(join(root, 'e2e', 'results'), { recursive: true });
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeFileSync(join(root, 'docs', 'requirements.md'), '- [ ] PROJ-1 Login');
  writeFileSync(join(root, 'e2e', 'login.spec.ts'), `test('login @PROJ-1', ...)`);
  writeFileSync(
    join(root, 'e2e', 'results', 'junit.xml'),
    `<testsuites><testsuite><testcase name="login @PROJ-1"></testcase></testsuite></testsuites>`,
  );
  writeFileSync(
    join(root, 'acp-trace.json'),
    JSON.stringify({
      scopes: [{ requirements: [{ type: 'markdown', path: 'docs/requirements.md' }],
        tests: [{ tech: 'playwright', globs: ['e2e/**/*.spec.ts'], results: ['e2e/results/*.xml'] }] }],
      history: { dir: 'runs' },
    }),
  );

  const port = 8911;
  const server = await serve(join(root, 'acp-trace.json'), root, { port });
  try {
    const base = `http://127.0.0.1:${port}`;
    const home = await fetch(`${base}/`);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /id="rtm-run"/);

    const report = await (await fetch(`${base}/api/report`)).json();
    assert.equal(report.requirements[0].state, 'verified');

    const run = await (await fetch(`${base}/run`, { method: 'POST' })).json();
    assert.equal(run.ok, true);
    assert.equal(typeof run.stats.coveragePct, 'number');

    const runs = await (await fetch(`${base}/api/runs`)).json();
    assert.ok(runs.runs.length >= 1);

    assert.equal((await fetch(`${base}/nope`)).status, 404);
  } finally {
    await new Promise((ok) => server.close(ok));
  }
});
