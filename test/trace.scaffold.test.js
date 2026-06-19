// Org onboarding scaffolder: token generation (idempotent) + compose/CI files (never clobbered).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scaffoldOrg, ensureEnvToken, generateToken } from '../dist/core/trace/scaffold.js';

test('generateToken: 48 hex chars, unique', () => {
  const a = generateToken();
  assert.match(a, /^[0-9a-f]{48}$/);
  assert.notEqual(a, generateToken());
});

test('ensureEnvToken: generates once, then is idempotent', () => {
  const root = mkdtempSync(join(tmpdir(), 'rtm-env-'));
  const first = ensureEnvToken(root);
  assert.equal(first.created, true);
  assert.match(readFileSync(join(root, '.env'), 'utf8'), /RTM_TOKEN=[0-9a-f]{48}/);
  const second = ensureEnvToken(root);
  assert.equal(second.created, false);
  assert.equal(second.token, first.token); // unchanged
});

test('ensureEnvToken: fills an empty RTM_TOKEN in an existing .env without losing other keys', () => {
  const root = mkdtempSync(join(tmpdir(), 'rtm-env2-'));
  writeFileSync(join(root, '.env'), 'JIRA_BASE_URL=https://x\nRTM_TOKEN=\n');
  const { token } = ensureEnvToken(root);
  const env = readFileSync(join(root, '.env'), 'utf8');
  assert.match(env, /JIRA_BASE_URL=https:\/\/x/); // preserved
  assert.match(env, new RegExp(`RTM_TOKEN=${token}`));
});

test('scaffoldOrg: writes compose + action, keeps existing files', () => {
  const root = mkdtempSync(join(tmpdir(), 'rtm-org-'));
  const first = scaffoldOrg(root);
  assert.ok(existsSync(join(root, 'docker-compose.trace.yml')));
  assert.ok(existsSync(join(root, '.github', 'workflows', 'rtm.yml')));
  assert.equal(first.written.length, 2);
  assert.match(readFileSync(join(root, '.github/workflows/rtm.yml'), 'utf8'), /--fail-on regression/);

  const second = scaffoldOrg(root); // idempotent: nothing clobbered
  assert.equal(second.written.length, 0);
  assert.equal(second.skipped.length, 2);
  assert.equal(second.token, first.token);
});
