// Integration test: pullJira / pullConfluence against a mock Atlassian REST server.
// Verifies the recursive folder layout, forward-format markdown, and acp-pull.json manifest.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pullJira, pullConfluence } from '../dist/core/pull.js';

const adf = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });

function issue(key, summary, type, extra = {}) {
  return { key, fields: { summary, issuetype: { name: type }, status: { name: 'To Do' }, ...extra } };
}

/** Start a mock server that serves a fixed Jira/Confluence topology. */
function startServer(routes) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const body = routes(req.url);
      res.writeHead(body === undefined ? 404 : 200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body ?? { error: 'not found' }));
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('pullJira: writes recursive epic/story/subtask tree + manifest', async () => {
  const search = (parent, issues) => `/rest/api/3/search?jql=${encodeURIComponent(`parent = ${parent} ORDER BY created ASC`)}`;
  const routes = (url) => {
    if (url.startsWith('/rest/api/3/issue/PROJ-1')) {
      return issue('PROJ-1', 'The Epic', 'Epic', { description: adf('Epic body.'), priority: { name: 'High' }, labels: ['x'] });
    }
    const u = decodeURIComponent(url);
    if (u.includes('parent = PROJ-1')) return { issues: [issue('PROJ-2', 'A Story', 'Story', { description: adf('Story body.') })], total: 1 };
    if (u.includes('parent = PROJ-2')) return { issues: [issue('PROJ-3', 'A Subtask', 'Sub-task', { description: adf('Sub body.') })], total: 1 };
    if (u.includes('parent = PROJ-3')) return { issues: [], total: 0 };
    return undefined;
  };
  const server = await startServer(routes);
  const { port } = server.address();
  process.env.JIRA_BASE_URL = `http://127.0.0.1:${port}`;
  process.env.JIRA_EMAIL = 'a@b.co';
  process.env.JIRA_API_TOKEN = 'tok';

  const dir = mkdtempSync(join(tmpdir(), 'acp-jira-'));
  try {
    const result = await pullJira('PROJ-1', dir, { force: true });

    assert.equal(result.issues.length, 3);
    assert.ok(existsSync(join(dir, 'epic.md')));
    assert.match(readFileSync(join(dir, 'epic.md'), 'utf8'), /^# The Epic\n\nEpic body\.\n\n## Priority\nHigh/);

    const storyFile = result.issues[1].file;
    assert.equal(storyFile, 'task-01-a-story.md');
    assert.ok(existsSync(join(dir, storyFile)));

    const subFile = result.issues[2].file;
    assert.equal(subFile, 'task-01-a-story/subtask-01-a-subtask.md');
    assert.ok(existsSync(join(dir, subFile)));

    const manifest = JSON.parse(readFileSync(join(dir, 'acp-pull.json'), 'utf8'));
    assert.equal(manifest.kind, 'jira');
    assert.equal(manifest.root, 'PROJ-1');
    assert.equal(manifest.issues[2].parentKey, 'PROJ-2');
    assert.equal(manifest.issues[2].type, 'Sub-task');
    assert.match(manifest.issues[0].url, /\/browse\/PROJ-1$/);
  } finally {
    server.close();
  }
});

test('pullJira: --no-recursive writes only the epic', async () => {
  const routes = (url) => (url.startsWith('/rest/api/3/issue/PROJ-9') ? issue('PROJ-9', 'Solo', 'Epic') : undefined);
  const server = await startServer(routes);
  const { port } = server.address();
  process.env.JIRA_BASE_URL = `http://127.0.0.1:${port}`;
  process.env.JIRA_EMAIL = 'a@b.co';
  process.env.JIRA_API_TOKEN = 'tok';
  const dir = mkdtempSync(join(tmpdir(), 'acp-jira-solo-'));
  try {
    const result = await pullJira('PROJ-9', dir, { recursive: false, force: true });
    assert.equal(result.issues.length, 1);
    assert.deepEqual(readdirSync(dir).sort(), ['acp-pull.json', 'epic.md']);
  } finally {
    server.close();
  }
});

test('pullConfluence: writes nested page tree + manifest', async () => {
  const page = (id, title, value) => ({ id, title, body: { storage: { value } }, _links: { webui: `/spaces/T/pages/${id}` } });
  const routes = (url) => {
    if (url.startsWith('/wiki/rest/api/content/100?')) return page('100', 'Root', '<p>Root body</p>');
    if (url.startsWith('/wiki/rest/api/content/100/child/page')) return { results: [page('101', 'Child One', '<p>Child body</p>')], size: 1 };
    if (url.startsWith('/wiki/rest/api/content/101/child/page')) return { results: [], size: 0 };
    return undefined;
  };
  const server = await startServer(routes);
  const { port } = server.address();
  process.env.CONFLUENCE_BASE_URL = `http://127.0.0.1:${port}`;
  process.env.CONFLUENCE_EMAIL = 'a@b.co';
  process.env.CONFLUENCE_API_TOKEN = 'tok';
  const dir = mkdtempSync(join(tmpdir(), 'acp-conf-'));
  try {
    const result = await pullConfluence('https://x/wiki/spaces/T/pages/100/Root', dir, { force: true });
    assert.equal(result.pages.length, 2);
    assert.match(readFileSync(join(dir, 'page.md'), 'utf8'), /^# Root\n\nRoot body\n/);
    assert.ok(existsSync(join(dir, '01-child-one', 'page.md')));
    const manifest = JSON.parse(readFileSync(join(dir, 'acp-pull.json'), 'utf8'));
    assert.equal(manifest.kind, 'confluence');
    assert.equal(manifest.pages[1].parentPageId, '100');
    assert.equal(manifest.pages[1].dir, '01-child-one');
  } finally {
    server.close();
  }
});

test('prepareDir: refuses a non-empty dir without force', async () => {
  const routes = (url) => (url.startsWith('/rest/api/3/issue/PROJ-1') ? issue('PROJ-1', 'X', 'Epic') : undefined);
  const server = await startServer(routes);
  const { port } = server.address();
  process.env.JIRA_BASE_URL = `http://127.0.0.1:${port}`;
  process.env.JIRA_EMAIL = 'a@b.co';
  process.env.JIRA_API_TOKEN = 'tok';
  const dir = mkdtempSync(join(tmpdir(), 'acp-busy-'));
  try {
    await pullJira('PROJ-1', dir, { recursive: false, force: true });
    await assert.rejects(() => pullJira('PROJ-1', dir, { recursive: false }), /not empty/);
  } finally {
    server.close();
  }
});
