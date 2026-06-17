/**
 * Reverse pipeline: pull a Jira epic (→ stories → sub-tasks) or a Confluence page tree
 * down into a round-trippable markdown folder.
 *
 * Output mirrors the forward `epic-folder` / `confluence-folder` layout so `acp jira` /
 * `acp confluence` can push it back, plus an `acp-pull.json` manifest carrying the keys/ids,
 * urls, status and parent links that the forward markdown format does not model.
 */
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { adfToMarkdown, type AdfNode } from './adfToMarkdown.js';
import { storageToMarkdown } from './storageToMarkdown.js';
import {
  getChildIssues,
  getChildPages,
  getIssue,
  getPage,
  pageWebUrl,
  parseIssueRef,
  parsePageRef,
  type ConfluencePage,
  type JiraIssue,
} from './atlassian.js';
import { getConfluenceCreds, getJiraCreds } from './config.js';
import type {
  ConfluencePullResult,
  JiraPullResult,
  PullOptions,
  PulledIssue,
  PulledPage,
} from './types.js';

const MANIFEST_NAME = 'acp-pull.json';
const SLUG_MAX = 50;
const AUTO_LABEL = 'n8n-pipeline-generated';

/* ── Jira ──────────────────────────────────────────────────────────────────── */

/** Pull a Jira epic and (recursively) its children into `dir` as markdown. */
export async function pullJira(ref: string, dir: string, opts: PullOptions = {}): Promise<JiraPullResult> {
  const recursive = opts.recursive !== false;
  const creds = getJiraCreds();
  const key = parseIssueRef(ref);
  const issue = await getIssue(key, creds);

  prepareDir(dir, opts.force === true);
  const issues: PulledIssue[] = [];

  writeFileSync(join(dir, 'epic.md'), issueToMarkdown(issue), 'utf8');
  issues.push(toPulledIssue(issue, 'epic.md', 'epic', creds.baseUrl, null));

  if (recursive) {
    await walkIssueChildren(key, dir, dir, 'task', issues, creds.baseUrl);
  }

  const manifestPath = writeManifest(dir, { kind: 'jira', root: key, issues });
  return { root: issues[0], issues, manifestPath, dir };
}

/** Recurse one level of child issues under `parentKey`, writing each and descending into sub-tasks. */
async function walkIssueChildren(
  parentKey: string,
  rootDir: string,
  parentDir: string,
  childWord: string,
  issues: PulledIssue[],
  baseUrl: string,
): Promise<void> {
  const children = await getChildIssues(parentKey);
  for (let i = 0; i < children.length; i += 1) {
    const child = children[i];
    const slug = slugify(child.fields.summary ?? child.key);
    const stem = `${childWord}-${pad(i + 1)}-${slug}`;
    const fileRel = relPath(rootDir, join(parentDir, `${stem}.md`));
    writeFileSync(join(parentDir, `${stem}.md`), issueToMarkdown(child), 'utf8');
    issues.push(toPulledIssue(child, fileRel, child.fields.issuetype?.name ?? 'Story', baseUrl, parentKey));

    const grandchildren = await getChildIssues(child.key);
    if (grandchildren.length > 0) {
      const subDir = join(parentDir, stem);
      mkdirSync(subDir, { recursive: true });
      await walkIssueChildren(child.key, rootDir, subDir, 'subtask', issues, baseUrl);
    }
  }
}

/** Render a Jira issue to the forward markdown format. */
export function issueToMarkdown(issue: JiraIssue): string {
  const f = issue.fields;
  const parts: string[] = [`# ${(f.summary ?? '(untitled)').trim()}`];

  const body = adfToMarkdown(f.description as AdfNode);
  if (body) parts.push(body);

  const priority = f.priority?.name;
  if (priority) parts.push(`## Priority\n${priority}`);

  const component = f.components?.find((c) => c.name)?.name;
  if (component) parts.push(`## Component\n${component}`);

  const labels = (f.labels ?? []).filter((l) => l && l !== AUTO_LABEL);
  if (labels.length > 0) parts.push(`## Labels\n${labels.join(', ')}`);

  return `${parts.join('\n\n')}\n`;
}

/** Build a manifest entry for a written issue. */
function toPulledIssue(
  issue: JiraIssue,
  file: string,
  type: string,
  baseUrl: string,
  parentKey: string | null,
): PulledIssue {
  return {
    file,
    key: issue.key,
    type,
    title: (issue.fields.summary ?? '').trim(),
    parentKey: parentKey ?? issue.fields.parent?.key ?? null,
    url: `${baseUrl}/browse/${issue.key}`,
    status: issue.fields.status?.name ?? null,
  };
}

/* ── Confluence ────────────────────────────────────────────────────────────── */

/** Pull a Confluence page and (recursively) its descendant pages into `dir` as markdown. */
export async function pullConfluence(ref: string, dir: string, opts: PullOptions = {}): Promise<ConfluencePullResult> {
  const recursive = opts.recursive !== false;
  const creds = getConfluenceCreds();
  const id = parsePageRef(ref);
  const page = await getPage(id, creds);

  prepareDir(dir, opts.force === true);
  const pages: PulledPage[] = [];

  writeFileSync(join(dir, 'page.md'), pageToMarkdown(page), 'utf8');
  pages.push(toPulledPage(page, '.', null, creds.baseUrl));

  if (recursive) {
    await walkChildPages(id, dir, '.', pages, creds.baseUrl);
  }

  const manifestPath = writeManifest(dir, { kind: 'confluence', root: id, pages });
  return { root: pages[0], pages, manifestPath, dir };
}

/** Recurse one level of child pages under `parentId`, each into its own subfolder. */
async function walkChildPages(
  parentId: string,
  parentFsDir: string,
  parentRelDir: string,
  pages: PulledPage[],
  baseUrl: string,
): Promise<void> {
  const children = await getChildPages(parentId);
  for (let i = 0; i < children.length; i += 1) {
    const child = children[i];
    const dirName = `${pad(i + 1)}-${slugify(child.title ?? child.id)}`;
    const fsDir = join(parentFsDir, dirName);
    const relDir = parentRelDir === '.' ? dirName : `${parentRelDir}/${dirName}`;
    mkdirSync(fsDir, { recursive: true });
    writeFileSync(join(fsDir, 'page.md'), pageToMarkdown(child), 'utf8');
    pages.push(toPulledPage(child, relDir, parentId, baseUrl));
    await walkChildPages(child.id, fsDir, relDir, pages, baseUrl);
  }
}

/** Render a Confluence page (storage XHTML) to markdown with a `# Title` heading. */
export function pageToMarkdown(page: ConfluencePage): string {
  const title = (page.title ?? '(untitled)').trim();
  const body = storageToMarkdown(page.body?.storage?.value);
  return body ? `# ${title}\n\n${body}\n` : `# ${title}\n`;
}

/** Build a manifest entry for a written page. */
function toPulledPage(page: ConfluencePage, dir: string, parentPageId: string | null, baseUrl: string): PulledPage {
  return {
    dir,
    pageId: page.id,
    title: (page.title ?? '').trim(),
    parentPageId,
    url: pageWebUrl(page, { baseUrl, email: '', apiToken: '' }),
  };
}

/* ── Shared helpers ────────────────────────────────────────────────────────── */

/** Ensure the target dir exists and is safe to write into. */
function prepareDir(dir: string, force: boolean): void {
  mkdirSync(dir, { recursive: true });
  if (!force) {
    const entries = readdirSync(dir).filter((e) => !e.startsWith('.'));
    if (entries.length > 0) {
      throw new Error(`Target directory "${dir}" is not empty. Pass force/--force to overwrite.`);
    }
  }
}

/** Write the sidecar manifest and return its path. */
function writeManifest(dir: string, data: Record<string, unknown>): string {
  const path = join(dir, MANIFEST_NAME);
  writeFileSync(path, `${JSON.stringify({ tool: 'ai-confluence-pipeline', ...data }, null, 2)}\n`, 'utf8');
  return path;
}

/** Lower-kebab slug from a title, capped to a filesystem-friendly length. */
export function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, '');
  return slug || 'untitled';
}

/** Zero-padded two-digit ordinal. */
function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Relative path from `root` to `full`, using forward slashes for manifest portability. */
function relPath(root: string, full: string): string {
  const r = root.replace(/[\\/]+$/, '');
  const normalized = full.replace(/\\/g, '/');
  const base = r.replace(/\\/g, '/');
  return normalized.startsWith(`${base}/`) ? normalized.slice(base.length + 1) : normalized;
}
