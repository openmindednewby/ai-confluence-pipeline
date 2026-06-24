// Web wizard slice 2: deep discovery (URL parse + link extraction + bounded BFS) + /api/sources/discover.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseSourceUrl, extractRefs, discover } from '../dist/core/web/discover.js';
import { startWebServer } from '../dist/core/web/server.js';

test('parseSourceUrl: jira browse / confluence pages / bare key / id', () => {
  assert.deepEqual(parseSourceUrl('https://x.atlassian.net/browse/PROJ-12'), { kind: 'jira-issue', id: 'PROJ-12' });
  assert.deepEqual(parseSourceUrl('https://x.atlassian.net/wiki/spaces/ENG/pages/98765/Title'), { kind: 'confluence-page', id: '98765' });
  assert.deepEqual(parseSourceUrl('PROJ-7'), { kind: 'jira-issue', id: 'PROJ-7' });
  assert.deepEqual(parseSourceUrl('12345'), { kind: 'confluence-page', id: '12345' });
  assert.equal(parseSourceUrl('not a url').kind, 'unknown');
});

test('extractRefs: jira keys + confluence page ids from a body', () => {
  const r = extractRefs('See PROJ-9 and ABC-100, doc at /wiki/spaces/E/pages/555/Spec and PROJ-9 again');
  assert.deepEqual(r.jiraKeys.sort(), ['ABC-100', 'PROJ-9']);
  assert.deepEqual(r.pageIds, ['555']);
});

// A fake graph: epic PROJ-1 → children PROJ-2/PROJ-3; PROJ-2 body links page 500; page 500 → child 501.
function fakeClient() {
  const jira = {
    'PROJ-1': { key: 'PROJ-1', title: 'Epic', body: 'parent epic', children: ['PROJ-2', 'PROJ-3'] },
    'PROJ-2': { key: 'PROJ-2', title: 'Story A', body: 'spec at /pages/500/x', children: [] },
    'PROJ-3': { key: 'PROJ-3', title: 'Story B', body: 'see PROJ-2', children: [] },
  };
  const pages = {
    '500': { id: '500', title: 'Design', body: 'links PROJ-3', children: ['501'] },
    '501': { id: '501', title: 'Sub-design', body: 'leaf', children: [] },
  };
  return {
    async jiraIssue(key) { const i = jira[key]; if (!i) throw new Error('404'); return { key: i.key, title: i.title, body: i.body }; },
    async jiraChildren(key) { return (jira[key]?.children ?? []).map((k) => ({ key: k, title: jira[k].title })); },
    async confluencePage(id) { const p = pages[id]; if (!p) throw new Error('404'); return { id: p.id, title: p.title, body: p.body }; },
    async confluenceChildren(id) { return (pages[id]?.children ?? []).map((c) => ({ id: c, title: pages[c].title })); },
  };
}

test('discover: epic → children + linked pages + cross-links, de-duplicated', async () => {
  const items = await discover('PROJ-1', fakeClient());
  const ids = items.map((i) => `${i.type}:${i.id}`).sort();
  // PROJ-1 (pasted), PROJ-2/PROJ-3 (children), page 500 (linked from PROJ-2), page 501 (child of 500)
  assert.deepEqual(ids, ['confluence:500', 'confluence:501', 'jira:PROJ-1', 'jira:PROJ-2', 'jira:PROJ-3']);
  assert.equal(items.find((i) => i.id === 'PROJ-1').via, 'pasted');
  assert.equal(items.find((i) => i.id === '500').via, 'linked');
  assert.equal(items.find((i) => i.id === '501').parent, '500');
  // no duplicates even though PROJ-2/PROJ-3 reference each other
  assert.equal(new Set(ids).size, ids.length);
});

test('discover: maxDepth stops expansion; unknown url throws', async () => {
  const shallow = await discover('PROJ-1', fakeClient(), { maxDepth: 0 });
  assert.deepEqual(shallow.map((i) => i.id), ['PROJ-1']); // depth 0 = seed only
  await assert.rejects(() => discover('gibberish', fakeClient()), /recognise/);
});

test('endpoint /api/sources/discover: uses the injected client', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'web-disc-'));
  const s = await startWebServer({ baseDir: dir, port: 0, discoverClient: fakeClient() });
  try {
    let res = await fetch(s.url + '/api/sources/discover', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: 'PROJ-1' }) });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.items.length, 5);
    // empty url → 400
    res = await fetch(s.url + '/api/sources/discover', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: '' }) });
    assert.equal(res.status, 400);
  } finally {
    await s.close();
  }
});
