/**
 * Convert an Atlassian Document Format (ADF) node tree to markdown.
 *
 * This is the reverse of the forward `mdToAdf` conversion (which lives in the n8n
 * `markdown-to-jira` Code node). It handles the subset the forward path emits plus the
 * common nodes real Jira issues contain, and degrades gracefully for unknown nodes
 * (recurses into their content) so no text is silently dropped.
 */

const HEADING_HASHES = '######';

/** An ADF node. Loosely typed because the tree is arbitrary JSON from the REST API. */
export interface AdfNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: AdfNode[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}

/** Convert a full ADF doc (or any node) to a trimmed markdown string. */
export function adfToMarkdown(doc: AdfNode | null | undefined): string {
  if (!doc || typeof doc !== 'object') return '';
  const blocks = (doc.content ?? []).map((n) => renderBlock(n)).filter((s) => s.length > 0);
  return blocks.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Render a block-level node to markdown (no trailing blank line). */
function renderBlock(node: AdfNode): string {
  switch (node.type) {
    case 'paragraph':
      return renderInline(node.content ?? []).trim();
    case 'heading':
      return renderHeading(node);
    case 'bulletList':
      return renderList(node, false);
    case 'orderedList':
      return renderList(node, true);
    case 'codeBlock':
      return renderCodeBlock(node);
    case 'blockquote':
      return renderBlockquote(node);
    case 'rule':
      return '---';
    case 'table':
      return renderTable(node);
    case 'mediaSingle':
    case 'mediaGroup':
      return renderMedia(node);
    default:
      // Unknown block: recurse so nested text survives.
      return (node.content ?? []).map(renderBlock).filter(Boolean).join('\n\n');
  }
}

/** `## Heading` from a heading node's `attrs.level`. */
function renderHeading(node: AdfNode): string {
  const level = clampLevel(Number(node.attrs?.level) || 1);
  return `${HEADING_HASHES.slice(0, level)} ${renderInline(node.content ?? []).trim()}`;
}

/** Bullet/ordered list, with two-space indentation for nested lists. */
function renderList(node: AdfNode, ordered: boolean): string {
  const items = (node.content ?? []).map((item, idx) => renderListItem(item, ordered, idx));
  return items.join('\n');
}

/** A single `listItem`: its first paragraph is the bullet text; nested lists are indented. */
function renderListItem(item: AdfNode, ordered: boolean, index: number): string {
  const marker = ordered ? `${index + 1}.` : '-';
  const parts = item.content ?? [];
  const lead = parts.find((p) => p.type === 'paragraph');
  const text = lead ? renderInline(lead.content ?? []).trim() : '';
  const nested = parts
    .filter((p) => p.type === 'bulletList' || p.type === 'orderedList')
    .map((p) => indent(renderBlock(p), '  '))
    .join('\n');
  return nested ? `${marker} ${text}\n${nested}` : `${marker} ${text}`;
}

/** Fenced code block, language from `attrs.language`. */
function renderCodeBlock(node: AdfNode): string {
  const lang = typeof node.attrs?.language === 'string' ? node.attrs.language : '';
  const text = (node.content ?? []).map((c) => c.text ?? '').join('');
  return `\`\`\`${lang}\n${text}\n\`\`\``;
}

/** Blockquote: prefix each rendered child line with `> `. */
function renderBlockquote(node: AdfNode): string {
  const inner = (node.content ?? []).map(renderBlock).filter(Boolean).join('\n\n');
  return inner
    .split('\n')
    .map((l) => `> ${l}`.trimEnd())
    .join('\n');
}

/** Markdown pipe table from an ADF table node. */
function renderTable(node: AdfNode): string {
  const rows = (node.content ?? []).filter((r) => r.type === 'tableRow');
  if (rows.length === 0) return '';
  const cellText = (cell: AdfNode): string =>
    (cell.content ?? [])
      .map((b) => (b.type === 'paragraph' ? renderInline(b.content ?? []) : renderBlock(b)))
      .join(' ')
      .replace(/\|/g, '\\|')
      .trim();
  const toRow = (r: AdfNode): string => `| ${(r.content ?? []).map(cellText).join(' | ')} |`;
  const headerCells = rows[0].content ?? [];
  const separator = `| ${headerCells.map(() => '---').join(' | ')} |`;
  return [toRow(rows[0]), separator, ...rows.slice(1).map(toRow)].join('\n');
}

/** Media is binary; emit a placeholder so reviewers know something was attached. */
function renderMedia(node: AdfNode): string {
  const media = (node.content ?? []).find((c) => c.type === 'media');
  const alt = typeof media?.attrs?.alt === 'string' ? media.attrs.alt : 'attachment';
  return `> _[media: ${alt}]_`;
}

/** Render an array of inline nodes (text with marks, links, hard breaks) to markdown. */
function renderInline(nodes: AdfNode[]): string {
  return nodes.map(renderInlineNode).join('');
}

/** Render a single inline node, applying its marks. */
function renderInlineNode(node: AdfNode): string {
  if (node.type === 'hardBreak') return '\n';
  if (node.type === 'text') return applyMarks(node.text ?? '', node.marks ?? []);
  if (node.type === 'inlineCard' || node.type === 'mention') {
    const href = node.attrs?.url ?? node.attrs?.href;
    return typeof href === 'string' ? href : (node.text ?? '');
  }
  // Unknown inline container: recurse.
  return renderInline(node.content ?? []);
}

/** Apply ADF marks (strong/em/code/link/strike) to a text run, innermost first. */
function applyMarks(text: string, marks: Array<{ type: string; attrs?: Record<string, unknown> }>): string {
  let out = text;
  for (const mark of marks) {
    switch (mark.type) {
      case 'strong':
        out = `**${out}**`;
        break;
      case 'em':
        out = `*${out}*`;
        break;
      case 'code':
        out = `\`${out}\``;
        break;
      case 'strike':
        out = `~~${out}~~`;
        break;
      case 'link': {
        const href = typeof mark.attrs?.href === 'string' ? mark.attrs.href : '';
        out = href ? `[${out}](${href})` : out;
        break;
      }
      default:
        break;
    }
  }
  return out;
}

/** Indent every line of a block by `pad`. */
function indent(block: string, pad: string): string {
  return block
    .split('\n')
    .map((l) => (l ? pad + l : l))
    .join('\n');
}

/** Keep heading level within 1..6. */
function clampLevel(level: number): number {
  if (level < 1) return 1;
  if (level > 6) return 6;
  return level;
}
