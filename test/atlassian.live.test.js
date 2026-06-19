// Live Atlassian checks (opt-in, read-only). These SKIP unless real creds + a target are provided,
// so `npm test` stays green offline. To run them:
//   JIRA_BASE_URL/JIRA_EMAIL/JIRA_API_TOKEN + RTM_LIVE_EPIC=PROJ-12   (Jira)
//   CONFLUENCE_BASE_URL/CONFLUENCE_EMAIL/CONFLUENCE_API_TOKEN + RTM_LIVE_PAGE=123456   (Confluence)
// All calls are GET-only — they never create or modify content.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureEnvLoaded } from '../dist/core/config.js';
import { getIssue, getChildIssues, getPage, parseIssueRef, parsePageRef } from '../dist/core/atlassian.js';

ensureEnvLoaded(); // populate process.env from .env before computing the skip gates

const jiraReady = Boolean(process.env.JIRA_BASE_URL && process.env.JIRA_EMAIL && process.env.JIRA_API_TOKEN && process.env.RTM_LIVE_EPIC);
const confluenceReady = Boolean(
  process.env.CONFLUENCE_BASE_URL && process.env.CONFLUENCE_EMAIL && process.env.CONFLUENCE_API_TOKEN && process.env.RTM_LIVE_PAGE,
);

test(
  'live Jira: read an epic + list its child issues (read-only)',
  { skip: jiraReady ? false : 'set JIRA_* + RTM_LIVE_EPIC to run' },
  async () => {
    const key = parseIssueRef(process.env.RTM_LIVE_EPIC);
    const epic = await getIssue(key);
    assert.equal(epic.key.toUpperCase(), key.toUpperCase());
    assert.equal(typeof epic.fields.summary, 'string');

    const children = await getChildIssues(key);
    assert.ok(Array.isArray(children));
    for (const c of children) {
      assert.match(c.key, /^[A-Z][A-Z0-9_]+-\d+$/);
    }
    process.stderr.write(`  [live] ${key} "${epic.fields.summary}" → ${children.length} child issue(s)\n`);
  },
);

test(
  'live Confluence: read a page with its storage body + version (read-only)',
  { skip: confluenceReady ? false : 'set CONFLUENCE_* + RTM_LIVE_PAGE to run' },
  async () => {
    const id = parsePageRef(process.env.RTM_LIVE_PAGE);
    const page = await getPage(id);
    assert.equal(page.id, id);
    assert.equal(typeof page.title, 'string');
    assert.ok(page.version && typeof page.version.number === 'number');
    process.stderr.write(`  [live] page ${id} "${page.title}" v${page.version.number}\n`);
  },
);
