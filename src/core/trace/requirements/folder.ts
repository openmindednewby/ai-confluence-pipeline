/**
 * Write gathered requirements to a local folder — one markdown file per requirement (with frontmatter)
 * plus a `manifest.json` index. This is the local source of truth the technical-analysis flow reads:
 * accept a mix of sources (Jira/Confluence/markdown/issues/command) and pin them on disk with stable keys.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Requirement } from '../types.js';

/** One manifest entry: the requirement plus the file it was written to. */
export interface RequirementFile extends Requirement {
  file: string;
}

export interface GatherResult {
  dir: string;
  files: RequirementFile[];
  manifestPath: string;
}

function slugKey(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-|-$/g, '') || 'REQ';
}

function frontmatter(r: Requirement): string {
  const esc = (s: string) => s.replace(/"/g, '\\"');
  const lines = [
    '---',
    `key: ${r.key}`,
    `title: "${esc(r.title)}"`,
    `status: ${r.declaredStatus ?? 'unknown'}`,
    `complete: ${r.declaredComplete}`,
    `source: ${r.source}`,
    ...(r.url ? [`url: ${r.url}`] : []),
    ...(r.scope ? [`scope: ${r.scope}`] : []),
    '---',
  ];
  return lines.join('\n');
}

/** Render one requirement's markdown file. */
export function requirementMarkdown(r: Requirement): string {
  return (
    `${frontmatter(r)}\n\n` +
    `# ${r.key} — ${r.title}\n\n` +
    `> Source: ${r.source}${r.url ? ` · ${r.url}` : ''} · Declared: ${r.declaredStatus ?? 'unknown'}\n\n` +
    `## Acceptance criteria\n\n` +
    `<!-- The local source of truth for ${r.key}. Fill in / refine the acceptance criteria here; the\n` +
    `     technical-analysis step reads this folder. Tag tests with @${r.key}. -->\n`
  );
}

/** Whether `dir` already has requirement files (used to guard accidental overwrite). */
function nonEmpty(dir: string): boolean {
  try {
    return readdirSync(dir).some((f) => f.endsWith('.md') || f === 'manifest.json');
  } catch {
    return false;
  }
}

/** Write the requirements folder (markdown-per-requirement + manifest.json). Dedupes by key. */
export function writeRequirementsFolder(requirements: Requirement[], dir: string, force = false): GatherResult {
  if (nonEmpty(dir) && !force) {
    throw new Error(`${dir} already has requirement files. Pass --force to overwrite.`);
  }
  mkdirSync(dir, { recursive: true });

  const seen = new Set<string>();
  const files: RequirementFile[] = [];
  for (const r of requirements) {
    const key = r.key.toUpperCase();
    if (seen.has(key)) continue; // first occurrence wins
    seen.add(key);
    const file = `${slugKey(key)}.md`;
    writeFileSync(join(dir, file), requirementMarkdown(r), 'utf8');
    files.push({ ...r, key, file });
  }

  const manifestPath = join(dir, 'manifest.json');
  writeFileSync(manifestPath, `${JSON.stringify(files, null, 2)}\n`, 'utf8');
  return { dir, files, manifestPath };
}

/** Load a previously written requirements manifest (for downstream steps). */
export function readRequirementsManifest(dir: string): RequirementFile[] {
  try {
    return JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as RequirementFile[];
  } catch {
    return [];
  }
}
