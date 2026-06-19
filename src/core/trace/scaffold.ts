/**
 * One-command org onboarding for `acp trace init --all`: on top of the autodetected config + a
 * requirements stub, generate a portal token into `.env` and scaffold the always-on compose service
 * and the PR GitHub Action — so a team goes from nothing to a running, secured, CI-wired RTM in one step.
 * Files are never clobbered (skipped if present) unless `force`.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** A URL-safe shared secret for the portal. */
export function generateToken(): string {
  return randomBytes(24).toString('hex');
}

/** Always-on portal as a self-contained compose service (consumer needs no Dockerfile). */
const COMPOSE_TEMPLATE = `# RTM portal — always-on. Storage stays in this repo's runs/. Set RTM_TOKEN in .env (acp trace
# init --all generated one) before exposing it; the portal then requires it on every request.
#   docker compose -f docker-compose.trace.yml up -d
services:
  acp-trace:
    image: node:22-alpine
    working_dir: /work
    command: sh -c "npm i -g ai-confluence-pipeline >/dev/null 2>&1 && acp trace serve --host 0.0.0.0 --watch"
    restart: unless-stopped
    ports:
      - "\${ACP_TRACE_PORT:-8787}:8787"
    env_file:
      - .env
    volumes:
      - ./:/work
`;

/** PR GitHub Action: run suites, fail on regression, comment the RTM, upload the dashboard. */
const ACTION_TEMPLATE = `name: RTM
on:
  pull_request:
  workflow_dispatch:
permissions:
  contents: read
  pull-requests: write
jobs:
  trace:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm i -g ai-confluence-pipeline
      - id: trace
        run: acp trace --config acp-trace.json --run --md rtm.md --html rtm.html --fail-on regression
        continue-on-error: true
      - if: github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const body = '### Requirements Traceability\\n\\n' + fs.readFileSync('rtm.md', 'utf8');
            const { data: comments } = await github.rest.issues.listComments({ owner: context.repo.owner, repo: context.repo.repo, issue_number: context.issue.number });
            const mine = comments.find(c => c.user.type === 'Bot' && c.body.startsWith('### Requirements Traceability'));
            if (mine) await github.rest.issues.updateComment({ owner: context.repo.owner, repo: context.repo.repo, comment_id: mine.id, body });
            else await github.rest.issues.createComment({ owner: context.repo.owner, repo: context.repo.repo, issue_number: context.issue.number, body });
      - uses: actions/upload-artifact@v4
        with: { name: rtm-dashboard, path: rtm.html }
      - if: steps.trace.outcome == 'failure'
        run: echo "RTM gate failed (regression)" && exit 1
`;

/** Ensure `.env` has a non-empty RTM_TOKEN; generate + persist one if missing. Returns the token. */
export function ensureEnvToken(repoDir: string): { token: string; created: boolean } {
  const envPath = join(repoDir, '.env');
  let text = '';
  try {
    text = readFileSync(envPath, 'utf8');
  } catch {
    /* no .env yet */
  }
  const match = /^RTM_TOKEN=(.*)$/m.exec(text);
  if (match && match[1].trim()) return { token: match[1].trim(), created: false };

  const token = generateToken();
  if (match) {
    text = text.replace(/^RTM_TOKEN=.*$/m, `RTM_TOKEN=${token}`);
  } else {
    text += `${text && !text.endsWith('\n') ? '\n' : ''}RTM_TOKEN=${token}\n`;
  }
  writeFileSync(envPath, text, 'utf8');
  return { token, created: true };
}

function writeIfAbsent(path: string, content: string, force: boolean, written: string[], skipped: string[]): void {
  if (existsSync(path) && !force) {
    skipped.push(path);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
  written.push(path);
}

/** Scaffold the org pieces (token + compose + CI). Returns what was written/skipped + the token. */
export function scaffoldOrg(repoDir: string, force = false): { written: string[]; skipped: string[]; token: string; tokenCreated: boolean } {
  const written: string[] = [];
  const skipped: string[] = [];
  const { token, created } = ensureEnvToken(repoDir);
  writeIfAbsent(join(repoDir, 'docker-compose.trace.yml'), COMPOSE_TEMPLATE, force, written, skipped);
  writeIfAbsent(join(repoDir, '.github', 'workflows', 'rtm.yml'), ACTION_TEMPLATE, force, written, skipped);
  return { written, skipped, token, tokenCreated: created };
}
