#!/usr/bin/env node
// Render representative RTM dashboards to ./preview so they can be visually QA'd in a browser
// without setting up a real repo. Covers every state + drift + orphan tests + regressions.
//   node scripts/preview-rtm.mjs   →   preview/rtm-sample.html , preview/rtm-portal-sample.html
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeReport } from '../dist/core/trace/computeState.js';
import { applyDiff } from '../dist/core/trace/history.js';
import { renderHtml } from '../dist/core/trace/report/html.js';
import { portalPage } from '../dist/core/trace/serve.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'preview');

const git = { sha: 'a1b2c3d4', shortSha: 'a1b2c3d4', branch: 'main', dirty: true, committedAt: '2026-06-19T10:00:00Z' };
const ref = (key) => ({ key, file: `${key.toLowerCase()}.spec.ts`, title: key, tech: 'playwright', via: 'tag' });
const res = (p, f, s) => ({ passed: p, failed: f, skipped: s, lastRun: '2026-06-19T12:00:00.000Z' });

const requirements = [
  { key: 'PROJ-1', title: 'User can log in', declaredStatus: 'Done', declaredComplete: true, source: 'jira-epic', url: 'https://example.atlassian.net/browse/PROJ-1' },
  { key: 'PROJ-2', title: 'User can log out', declaredStatus: 'Done', declaredComplete: true, source: 'jira-epic' },
  { key: 'PROJ-3', title: 'Password reset email', declaredStatus: 'In Progress', declaredComplete: false, source: 'jira-epic' },
  { key: 'PROJ-4', title: 'Two-factor auth', declaredStatus: 'Done', declaredComplete: true, source: 'roadmap-html' },
  { key: 'PROJ-5', title: 'Session expiry', declaredStatus: 'To Do', declaredComplete: false, source: 'markdown' },
];
const refs = [ref('PROJ-1'), ref('PROJ-2'), ref('PROJ-3'), ref('PROJ-5'), ref('PROJ-999')];

// Previous run: PROJ-2 was verified, PROJ-5 was specified.
const prev = computeReport({
  requirements, refs,
  ingested: { byKey: new Map([['PROJ-1', res(2, 0, 0)], ['PROJ-2', res(1, 0, 0)]]), occurrences: [] },
  git, generatedAt: '2026-06-19T09:00:00.000Z', project: 'Acme Auth',
});

// Current run: PROJ-2 now FAILS (regression), PROJ-5 now passes (improvement), PROJ-999 is an orphan.
const curr = computeReport({
  requirements, refs,
  ingested: {
    byKey: new Map([['PROJ-1', res(2, 0, 0)], ['PROJ-2', res(0, 1, 0)], ['PROJ-5', res(1, 0, 0)]]),
    occurrences: [{ key: 'PROJ-999', file: 'ghost.spec.ts', status: 'failed' }],
  },
  git, generatedAt: '2026-06-19T12:00:00.000Z', project: 'Acme Auth',
});
applyDiff(curr, prev);

mkdirSync(OUT, { recursive: true });
const history = ['2026-06-19T12-00-00-000Z_a1b2c3d4.json', '2026-06-19T09-00-00-000Z_f3e61ba0.json'];
writeFileSync(join(OUT, 'rtm-sample.html'), renderHtml(curr));
writeFileSync(join(OUT, 'rtm-portal-sample.html'), portalPage(curr, history));
writeFileSync(join(OUT, 'rtm-portal-readonly-sample.html'), portalPage(curr, history, { readOnly: true }));

process.stdout.write(
  `Wrote sample dashboards to preview/:\n` +
  `  rtm-sample.html               (the static report)\n` +
  `  rtm-portal-sample.html        (live portal — Run button)\n` +
  `  rtm-portal-readonly-sample.html (git-backed read-only)\n` +
  `Open any in a browser to visually QA. Covers: verified/failing/unverified/specified, drift, 1 regression, 1 improvement, 1 orphan test.\n`,
);
