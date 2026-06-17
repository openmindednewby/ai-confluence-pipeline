/**
 * Configuration loader. Reads the repo `.env` (same file the bash/n8n flows use) and
 * exposes the values the publish layer needs. Stage 1 only needs the n8n webhook base URL.
 */
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_WEBHOOK_URL = 'http://localhost:10353/webhook';

let loaded = false;

/** Walk up from this file to find the project root (the dir containing `.env` or `package.json`). */
function findProjectRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 6; depth += 1) {
    if (existsSync(resolve(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

/** Load `.env` once, from the project root and the current working directory. */
export function ensureEnvLoaded(): void {
  if (loaded) return;
  const root = findProjectRoot();
  loadDotenv({ path: resolve(root, '.env') });
  loadDotenv({ path: resolve(process.cwd(), '.env') });
  loaded = true;
}

/** Which backend the publish layer targets. Stage 1 = `n8n`; `direct` is reserved for Stage 2. */
export type Backend = 'n8n' | 'direct';

export interface AcpConfig {
  backend: Backend;
  /** n8n webhook base URL, e.g. `http://localhost:10353/webhook` (no trailing slash). */
  webhookUrl: string;
}

/** Resolve the active configuration from the environment. */
export function getConfig(): AcpConfig {
  ensureEnvLoaded();
  const backend: Backend = process.env.ACP_BACKEND === 'direct' ? 'direct' : 'n8n';
  const webhookUrl = (process.env.WEBHOOK_URL || DEFAULT_WEBHOOK_URL).replace(/\/+$/, '');
  return { backend, webhookUrl };
}

/** Atlassian Basic-auth credentials shared by Jira and Confluence direct-REST access. */
export interface AtlassianCreds {
  /** Site base URL, e.g. `https://yourcompany.atlassian.net` (no trailing slash). */
  baseUrl: string;
  /** Account email used for the Basic-auth pair. */
  email: string;
  /** API token used for the Basic-auth pair. */
  apiToken: string;
}

/** Build the `Authorization: Basic …` header value from email + API token. */
export function basicAuthHeader(creds: AtlassianCreds): string {
  const token = Buffer.from(`${creds.email}:${creds.apiToken}`).toString('base64');
  return `Basic ${token}`;
}

/** Resolve Jira REST credentials from `.env`. Throws a helpful error if any are missing. */
export function getJiraCreds(): AtlassianCreds {
  ensureEnvLoaded();
  return requireCreds('JIRA', process.env.JIRA_BASE_URL, process.env.JIRA_EMAIL, process.env.JIRA_API_TOKEN);
}

/** Resolve Confluence REST credentials from `.env`. Throws a helpful error if any are missing. */
export function getConfluenceCreds(): AtlassianCreds {
  ensureEnvLoaded();
  return requireCreds(
    'CONFLUENCE',
    process.env.CONFLUENCE_BASE_URL,
    process.env.CONFLUENCE_EMAIL,
    process.env.CONFLUENCE_API_TOKEN,
  );
}

/** Validate that all three credential parts are present, returning a normalised creds object. */
function requireCreds(prefix: string, baseUrl?: string, email?: string, apiToken?: string): AtlassianCreds {
  if (!baseUrl || !email || !apiToken) {
    throw new Error(
      `${prefix}_BASE_URL, ${prefix}_EMAIL, and ${prefix}_API_TOKEN must be set in .env for direct REST access.`,
    );
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ''), email, apiToken };
}
