// acp questions: markdown parsers (pure) + HTML generation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractTitle, extractFlowMermaid, mapQuestionsToNodes, parseQuestions, parseEdges, buildQuestionsData,
} from '../dist/core/questions/parse.js';
import { renderQuestionsHtml, generateQuestions, assetsDir } from '../dist/core/questions/generate.js';

const SAMPLE = `# Editing decision

## Flow overview

\`\`\`mermaid
flowchart TD
  START["Start"] --> ESYS{"Q1 · Editing allowed?"}
  ESYS -->|Yes| EDIT["Editing path"]
  ESYS -->|No| LOCK["Locked path"]
  classDef pending fill:#ffe8b3;
  class ESYS pending;
\`\`\`

## Open questions (QA)

- **Q1 — Editing allowed?:**
  - [ ] No
  - [ ] Yes
- **Q2 — Unmapped one?:**
  - [ ] A
  - [ ] B
`;

test('extractTitle / extractFlowMermaid', () => {
  assert.equal(extractTitle(SAMPLE), 'Editing decision');
  assert.match(extractFlowMermaid(SAMPLE), /ESYS\{"Q1/);
  assert.throws(() => extractFlowMermaid('# x\n\nno flow here'), /Flow overview/);
});

test('mapQuestionsToNodes binds Q<n> to its node id', () => {
  const map = mapQuestionsToNodes(extractFlowMermaid(SAMPLE));
  assert.equal(map[1], 'ESYS');
});

test('parseQuestions reads the QA list', () => {
  const qs = parseQuestions(SAMPLE);
  assert.equal(qs.length, 2);
  assert.deepEqual(qs[0], { n: 1, title: 'Editing allowed?', options: ['No', 'Yes'] });
});

test('parseEdges: arrow forms, labels, and multi-target expansion', () => {
  const e = parseEdges([
    'A --> B',
    'A -->|Yes| C',
    'A -.-> D',
    'A ==> E',
    'A --- F',
    'G --> H & I',
    'J & K --> L',
    '%% a comment',
    'classDef pending fill:#fff;',
  ].join('\n'));
  const pair = (s, t) => e.some((x) => x.src === s && x.tgt === t);
  assert.ok(pair('A', 'B') && pair('A', 'D') && pair('A', 'E') && pair('A', 'F'));
  assert.equal(e.find((x) => x.tgt === 'C').label, 'Yes');
  assert.ok(pair('G', 'H') && pair('G', 'I')); // multi-target RHS
  assert.ok(pair('J', 'L') && pair('K', 'L')); // multi-source LHS
  assert.ok(!e.some((x) => x.src === 'classDef')); // class lines skipped
});

test('buildQuestionsData: label-binding is order-independent + flags unmapped', () => {
  const { data, unmapped } = buildQuestionsData(SAMPLE);
  const q1 = data.questions.find((q) => q.n === 1);
  // options listed [No, Yes] but bound by label → [LOCK, EDIT], not positional [EDIT, LOCK]
  assert.deepEqual(q1.targets, ['LOCK', 'EDIT']);
  assert.equal(q1.node, 'ESYS');
  assert.deepEqual(unmapped, [2]); // Q2 has no node
  assert.equal(data.questions.find((q) => q.n === 2).node, null);
});

test('renderQuestionsHtml injects title, mermaid tag, and data (pure)', () => {
  const html = renderQuestionsHtml(
    '<title>{{TITLE}}</title><!--MERMAID--><script>const D = window.__DATA__ || {};</script>',
    { title: 'T<x>', mermaid: 'flowchart TD\n A-->B', questions: [], edges: [] },
    '<script src="cdn"></script>',
  );
  assert.match(html, /<title>T&lt;x&gt;<\/title>/); // title escaped
  assert.match(html, /<script src="cdn">/); // mermaid tag injected
  assert.match(html, /window\.__DATA__ = \{/); // data embedded
});

test('generateQuestions end-to-end (cdn mode, real template asset)', () => {
  const { html, data, unmapped } = generateQuestions(SAMPLE, { mermaid: 'cdn', assets: assetsDir() });
  assert.match(html, /cdn\.jsdelivr\.net\/npm\/mermaid/);
  assert.match(html, /window\.__DATA__ = /);
  assert.equal(data.questions.length, 2);
  assert.deepEqual(unmapped, [2]);
});
