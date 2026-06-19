/**
 * Render a conventions-following Q&A markdown into the self-contained interactive HTML, by injecting
 * the parsed data + the mermaid runtime into the shipped template. Mermaid can be inlined (default —
 * one portable file), linked from a CDN (`--cdn`), or referenced from the asset (`--link`).
 */
import { readFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildQuestionsData } from './parse.js';
import type { QuestionsData } from './types.js';

const CDN = 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js';

export type MermaidMode = 'inline' | 'cdn' | 'link';

/** The shipped assets directory (template + vendored mermaid), resolved relative to this module. */
export function assetsDir(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'assets');
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Build the `<script>` element that loads mermaid for the chosen mode. */
function mermaidScript(mode: MermaidMode, assets: string, outPath: string): string {
  if (mode === 'cdn') return `<script src="${CDN}"></script>`;
  if (mode === 'link') {
    const rel = relative(dirname(resolve(outPath)), resolve(assets, 'mermaid.min.js')).split(sep).join('/');
    return `<script src="${rel}"></script>`;
  }
  const js = readFileSync(resolve(assets, 'mermaid.min.js'), 'utf8');
  return `<script>${js}</script>`; // safe: the bundle contains no literal </script>
}

/** Inject data + mermaid into the template. Pure given the template + mermaid script. */
export function renderQuestionsHtml(template: string, data: QuestionsData, mermaidTag: string): string {
  const json = JSON.stringify(data).replace(/</g, '\\u003c'); // so a "</script>" in a label can't close the tag
  return template
    .replace(/\{\{TITLE\}\}/g, escHtml(data.title))
    .replace('<!--MERMAID-->', mermaidTag)
    .replace('window.__DATA__ || ', `window.__DATA__ = ${json};\nwindow.__DATA__ || `);
}

export interface QuestionsResult {
  html: string;
  data: QuestionsData;
  unmapped: number[];
}

export interface GenerateOptions {
  mermaid?: MermaidMode;
  /** Output path (only used to compute a relative mermaid `--link` path). */
  outPath?: string;
  /** Override the assets dir (tests). */
  assets?: string;
}

/** Parse markdown → data → HTML. The one-call entry the CLI + MCP use. */
export function generateQuestions(md: string, opts: GenerateOptions = {}): QuestionsResult {
  const assets = opts.assets ?? assetsDir();
  const template = readFileSync(resolve(assets, 'questions-template.html'), 'utf8');
  const { data, unmapped } = buildQuestionsData(md);
  const tag = mermaidScript(opts.mermaid ?? 'inline', assets, opts.outPath ?? 'out.html');
  return { html: renderQuestionsHtml(template, data, tag), data, unmapped };
}
