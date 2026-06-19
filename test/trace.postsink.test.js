// Generic result sink: POST the full report JSON to any HTTP endpoint (a company's own collector).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { postReport } from '../dist/core/trace/publish.js';
import { computeReport } from '../dist/core/trace/computeState.js';

function demoReport() {
  return computeReport({
    requirements: [{ key: 'PROJ-1', title: 'Login', declaredStatus: 'Done', declaredComplete: true, source: 'markdown' }],
    refs: [{ key: 'PROJ-1', file: 'a.spec.ts', title: 'login', tech: 'playwright', via: 'tag' }],
    ingested: { byKey: new Map([['PROJ-1', { passed: 1, failed: 0, skipped: 0, lastRun: null }]]), occurrences: [] },
    git: { sha: null, shortSha: 'abc1234', branch: 'main', dirty: false, committedAt: null },
    generatedAt: '2026-06-19T00:00:00Z', project: 'Acme',
  });
}

test('postReport: POSTs the full report JSON (+ custom headers) to a server', async () => {
  let received = null;
  let auth = null;
  const server = createServer((req, res) => {
    auth = req.headers.authorization ?? null;
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => { received = JSON.parse(body); res.writeHead(200); res.end('ok'); });
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const port = server.address().port;
  try {
    const ok = await postReport(demoReport(), { url: `http://127.0.0.1:${port}/ingest`, headers: { Authorization: 'Bearer t' } });
    assert.equal(ok, true);
    assert.equal(received.project, 'Acme');
    assert.equal(received.requirements[0].key, 'PROJ-1'); // full report, not just a summary
    assert.equal(received.stats.coveragePct, 100);
    assert.equal(auth, 'Bearer t'); // custom headers forwarded
  } finally {
    await new Promise((ok) => server.close(ok));
  }
});

test('postReport: a string target works and a bad URL returns false (never throws)', async () => {
  assert.equal(await postReport(demoReport(), 'http://127.0.0.1:1/nope'), false);
});
