// Web wizard slice 4: /api/design runs the wizard (injected fake AI) → returns the FeaturePack.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWebServer } from '../dist/core/web/server.js';

const FAKE = JSON.stringify({
  gapAnalysis: 'g',
  technicalAnalysis: '# T',
  systemDiagram: 'flowchart LR\n  UI -->|creds| API',
  dbChanges: ['add column users.sso_id varchar null'],
  tasks: [{ key: 'PROJ-1', title: 'Implement SSO', acceptanceCriteria: ['rejects bad creds'], tests: [{ tech: 'jest', title: 't' }],
    acceptanceTests: [{ name: 'bad', steps: [{ POST: '/login', expect: { status: 401 } }] }] }],
});

async function withServer(run) {
  const baseDir = mkdtempSync(join(tmpdir(), 'web-design-'));
  // pulled requirements (as slice 3 would write)
  mkdirSync(join(baseDir, '.acp', 'requirements'), { recursive: true });
  writeFileSync(join(baseDir, '.acp', 'requirements', 'index.md'), '# Requirements\n\n- [ ] PROJ-1 SSO login\n');
  const s = await startWebServer({ baseDir, port: 0, chat: async () => FAKE });
  try {
    await run(s.url, baseDir);
  } finally {
    await s.close();
  }
}

test('POST /api/design: returns the FeaturePack (system diagram, db changes, tasks, curls)', async () => {
  await withServer(async (url) => {
    const res = await fetch(url + '/api/design', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ feature: 'SSO', dbChanges: true }) });
    assert.equal(res.status, 200);
    const d = await res.json();
    assert.equal(d.pack.feature, 'SSO');
    assert.match(d.pack.systemMermaid, /flowchart LR/);
    assert.deepEqual(d.pack.dbChanges, ['add column users.sso_id varchar null']);
    assert.equal(d.pack.tasks.length, 1);
    assert.equal(d.pack.curls.length, 1);
    assert.match(d.html, /feature-pack\.html$/);
  });
});

test('POST /api/design: no feature name → 400', async () => {
  await withServer(async (url) => {
    const res = await fetch(url + '/api/design', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ feature: '' }) });
    assert.equal(res.status, 400);
  });
});
