/**
 * Types for the interactive decision/Q&A generator (`acp questions`). A conventions-following
 * markdown doc (a `## Flow overview` mermaid diagram + a `## Open questions (QA)` checklist where each
 * question carries a `Q<n>` token also present on a diagram node) becomes a self-contained interactive
 * HTML: answer the questions, the bound nodes recolour, rejected branches dim, and answers export to
 * markdown/JSON ready for `acp confluence` / `acp jira`.
 */

/** A directed edge of the flow diagram, with its (optional pipe) label. */
export interface FlowEdge {
  src: string;
  tgt: string;
  label: string | null;
}

/** One question parsed from the QA list, joined to its diagram node + per-option branch targets. */
export interface Question {
  n: number;
  title: string;
  options: string[];
  /** Diagram node id bound via the `Q<n>` token, or null if unmapped. */
  node: string | null;
  /** Branch target per option (index-aligned). Resolved by edge label, falling back to edge order. */
  targets: (string | null)[];
}

/** Everything the HTML template needs, embedded as `window.__DATA__`. */
export interface QuestionsData {
  title: string;
  mermaid: string;
  questions: Question[];
  /** `[src, tgt]` pairs (labels dropped) — used by the viewer's branch-liveness computation. */
  edges: Array<[string, string]>;
}
