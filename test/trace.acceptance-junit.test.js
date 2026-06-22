// Phase 2 step 8: JUnit emission keyed by requirement + config (acceptance tech + runner block).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { toJUnitXml, writeJUnit } from '../dist/core/trace/acceptance/junit.js';
import { parseJUnit } from '../dist/core/trace/results.js';
import { parseTraceConfig } from '../dist/core/trace/config.js';

const sampleResult = {
  total: 2,
  passed: 1,
  failed: 1,
  cases: [
    { req: 'PROJ-1', name: 'health', ok: true, steps: [], durationMs: 5 },
    { req: 'PROJ-2', name: 'bad path', ok: false, steps: [{ ok: false, failures: ['status: expected 200, got 404'], request: 'GET /nope' }], durationMs: 10, failure: 'GET /nope — status: expected 200, got 404' },
  ],
};

test('toJUnitXml: counts + per-case testcases with embedded req key', () => {
  const xml = toJUnitXml(sampleResult);
  assert.match(xml, /<testsuites tests="2" failures="1">/);
  assert.match(xml, /name="PROJ-1 health"/);
  assert.match(xml, /classname="acceptance PROJ-2"/);
  assert.match(xml, /<failure message="GET \/nope/);
});

test('toJUnitXml: round-trips through trace JUnit ingestion (keys extractable)', () => {
  const xml = toJUnitXml(sampleResult);
  const parsed = parseJUnit(xml);
  assert.equal(parsed.length, 2);
  const p1 = parsed.find((p) => p.name.includes('PROJ-1'));
  assert.equal(p1.status, 'passed');
  const p2 = parsed.find((p) => p.name.includes('PROJ-2'));
  assert.equal(p2.status, 'failed');
});

test('writeJUnit: creates the file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'acp-junit-'));
  const path = join(dir, 'nested', 'acceptance.xml');
  writeJUnit(path, sampleResult);
  assert.match(readFileSync(path, 'utf8'), /<testsuite name="acceptance"/);
});

test('config: accepts tech "acceptance" + a runner block', () => {
  const cfg = parseTraceConfig(
    JSON.stringify({
      scopes: [
        {
          requirements: [{ type: 'markdown', path: 'docs/reqs.md' }],
          tests: [{ tech: 'acceptance', globs: ['.acp/tests/**/*.acp.json'], results: ['.acp/results/acceptance.xml'] }],
        },
      ],
      runner: {
        baseUrl: 'http://localhost:8080',
        headers: { 'X-Env': 'test' },
        setup: { name: 'login', steps: [{ POST: '/login', expect: { status: 200 }, capture: { tok: '$.token' } }] },
      },
    }),
  );
  assert.equal(cfg.scopes[0].tests[0].tech, 'acceptance');
  assert.equal(cfg.runner.baseUrl, 'http://localhost:8080');
  assert.equal(cfg.runner.setup.steps.length, 1);
});

test('config: runner is optional (existing configs unaffected)', () => {
  const cfg = parseTraceConfig(JSON.stringify({ scopes: [{ requirements: [{ type: 'markdown', path: 'r.md' }] }] }));
  assert.equal(cfg.runner, undefined);
});
