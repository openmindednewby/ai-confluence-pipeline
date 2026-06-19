/**
 * Pure parsers for the Q&A markdown → QuestionsData. Ported from the original CommonJS tool to ESM/TS,
 * with two robustness upgrades: edges parse for more arrow forms (`-->`, `---`, `-.->`, `==>`, inline
 * labels, multi-target `A --> B & C`), and each option binds to its branch by matching the edge LABEL
 * (order-independent), falling back to positional order only when there's no label match.
 */
import type { FlowEdge, Question, QuestionsData } from './types.js';

const NON_EDGE = /^(classDef|class|subgraph|end|style|linkStyle|click|direction|flowchart|graph)\b/;
const NODE_REF = '[A-Za-z_][A-Za-z0-9_]*';

/** First `# ` heading → page title. */
export function extractTitle(md: string): string {
  const m = md.match(/^#\s+(.+?)\s*$/m);
  return m ? m[1].trim() : 'Open Questions';
}

/** First ```mermaid block under the `## Flow overview` heading. Throws if absent. */
export function extractFlowMermaid(md: string): string {
  const after = md.split(/^##\s+Flow overview\s*$/m)[1];
  if (!after) throw new Error('no "## Flow overview" section found');
  const m = after.match(/```mermaid\s*([\s\S]*?)```/);
  if (!m) throw new Error('no mermaid block under "## Flow overview"');
  return m[1].replace(/\s+$/, '');
}

/** Map `Q<n>` (found in a node's quoted label) → node id. */
export function mapQuestionsToNodes(mermaid: string): Record<number, string> {
  const map: Record<number, string> = {};
  const re = new RegExp(`\\b(${NODE_REF})\\s*[\\[\\{(]+\\s*"([^"]*)"`, 'g');
  for (let m = re.exec(mermaid); m; m = re.exec(mermaid)) {
    const q = m[2].match(/Q(\d+)/);
    if (q) map[Number(q[1])] = m[1];
  }
  return map;
}

/** Parse the `## Open questions (QA)` list into raw questions (node binding done later). */
export function parseQuestions(md: string): Array<{ n: number; title: string; options: string[] }> {
  const after = md.split(/^##\s+Open questions \(QA\)\s*$/m)[1];
  if (!after) throw new Error('no "## Open questions (QA)" section found');
  const questions: Array<{ n: number; title: string; options: string[] }> = [];
  let cur: { n: number; title: string; options: string[] } | null = null;
  for (const line of after.split(/\r?\n/)) {
    if (/^##\s+/.test(line)) break; // next H2 ends the section
    const qm = line.match(/^- \*\*Q(\d+)\s*[—-]\s*(.+?):?\*\*\s*$/);
    if (qm) {
      cur = { n: Number(qm[1]), title: qm[2].trim(), options: [] };
      questions.push(cur);
      continue;
    }
    const om = line.match(/^\s+- \[[ xX]?\]\s+(.+?)\s*$/);
    if (om && cur) cur.options.push(om[1].trim());
  }
  if (!questions.length) throw new Error('no questions parsed from the QA section');
  return questions;
}

/** Parse edges (with labels + multi-target expansion). Tolerant of several mermaid arrow forms. */
export function parseEdges(mermaid: string): FlowEdge[] {
  const refs = `${NODE_REF}(?:\\s*&\\s*${NODE_REF})*`;
  // LHS  ARROW  [|label|]  RHS — ARROW covers -->, ---, -.->, ==> and inline-label variants.
  const re = new RegExp(
    `^(${refs})\\s*(?:-\\.->|-\\.-|-->|---|==>|===|--[ox]|--[^>|]*-->|==[^>|]*==>|-\\.[^>|]*\\.->)\\s*(?:\\|([^|]*)\\|)?\\s*(${refs})`,
  );
  const out: FlowEdge[] = [];
  for (const raw of mermaid.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('%%') || NON_EDGE.test(line)) continue;
    const m = line.match(re);
    if (!m) continue;
    const lhs = m[1].split('&').map((s) => s.trim()).filter(Boolean);
    const rhs = m[3].split('&').map((s) => s.trim()).filter(Boolean);
    const label = m[2] ? m[2].trim() : null;
    for (const src of lhs) for (const tgt of rhs) out.push({ src, tgt, label });
  }
  return out;
}

/** Per-option branch target: match the option text to an outgoing edge label, else fall back to order. */
function resolveTargets(node: string | null, options: string[], edges: FlowEdge[]): (string | null)[] {
  if (!node) return options.map(() => null);
  const outs = edges.filter((e) => e.src === node);
  return options.map((opt, i) => {
    const byLabel = outs.find((e) => e.label && e.label.toLowerCase() === opt.trim().toLowerCase());
    if (byLabel) return byLabel.tgt;
    return outs[i] ? outs[i].tgt : null;
  });
}

/** Build the full QuestionsData from the markdown. Throws on missing required sections. */
export function buildQuestionsData(md: string): { data: QuestionsData; unmapped: number[] } {
  const title = extractTitle(md);
  const mermaid = extractFlowMermaid(md);
  const nodeOf = mapQuestionsToNodes(mermaid);
  const edges = parseEdges(mermaid);
  const questions: Question[] = parseQuestions(md).map((q) => {
    const node = nodeOf[q.n] ?? null;
    return { n: q.n, title: q.title, options: q.options, node, targets: resolveTargets(node, q.options, edges) };
  });
  const unmapped = questions.filter((q) => !q.node).map((q) => q.n);
  return { data: { title, mermaid, questions, edges: edges.map((e) => [e.src, e.tgt]) }, unmapped };
}
