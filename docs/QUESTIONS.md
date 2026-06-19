# Interactive decisions (`acp questions`)

Turn an **open-questions markdown** (a flow diagram + a question checklist) into a **self-contained
interactive HTML**: stakeholders answer in a browser, the matching diagram nodes recolour live, rejected
branches dim, and the answers export to markdown/JSON ready to publish with `acp confluence` / `acp jira`.

```bash
acp questions open-questions.md                 # → open-questions.html (mermaid inlined; works offline)
acp questions oq.md --out decisions.html
acp questions oq.md --cdn                        # load mermaid from a CDN (smaller file, needs internet)
```

Agents can call the MCP tool **`questions_to_html`** (`{ input, out?, cdn? }`).

## What the HTML does

- One single-select group per question + a per-question **comment** box + a **General notes** box.
- Answering recolours the bound node (amber **pending** → green **answered**) and **dims the rejected
  branches red** (computed from branch liveness); a `X / N answered` counter tracks progress.
- **Autosaves** to `localStorage` (survives reload). **Import .json** resumes a previously exported set;
  **Reset** clears.
- **Export .md / .json** download the answers + comments + general notes (the markdown also embeds the
  flow diagram); **Copy answers** puts the markdown on the clipboard; **Export PNG** rasterises the
  diagram. A draggable splitter resizes the diagram.

## The publish loop

```bash
acp questions open-questions.md      # generate, share the .html, collect answers
# a stakeholder clicks "Export .md" → answers.md (decisions + the mermaid flow)
acp confluence --page answers.md     # publish the decisions + diagram (mermaid round-trips natively)
```

No PNG copy-paste needed — the mermaid diagram round-trips into the Confluence macro (and a Jira code
block) automatically (`CONFLUENCE_MERMAID_MACRO`).

## Markdown conventions

The parser is deliberately simple — keep open-questions docs consistent:

1. **Title** — the first `#` H1 is the page title.
2. **Flow overview** — a `## Flow overview` heading followed by a ` ```mermaid ` block (the first one
   under that heading is the interactive diagram).
3. **Question ↔ node binding** — each question node carries a `Q<n>` token in its label, e.g.
   `ESYS{"Q1 · Editing allowed?"}`. Put each `Q<n>` on exactly one node. A `Q<n>` not found on any node
   still renders but is flagged `(unmapped)` (the build log lists these).
4. **Colour classes** — define `classDef pending` (amber) and `classDef confirmed` (green) and assign
   nodes. Unanswered question nodes go in `pending`.
5. **QA list** — a `## Open questions (QA)` heading, then one bullet per question with nested options:
   ```markdown
   - **Q1 — Editing allowed?:**
     - [ ] Yes
     - [ ] No
   ```
6. **Option ↔ branch binding** — options bind to the diagram branches by **matching the edge label**
   (e.g. option `Yes` → the `-->|Yes|` edge), so **order no longer matters**. If a label doesn't match,
   it falls back to the outgoing-edge order. Leaf decision nodes (no outgoing edges) just turn green.

## Notes

- The mermaid runtime is **vendored** (`assets/mermaid.min.js`) and inlined by default, so the output is
  one portable file. Use `--cdn` for a small file, or `--link` to reference the vendored copy by path.
- Edge parsing handles `-->`, `---`, `-.->`, `==>`, inline labels, and multi-target `A --> B & C`.
- Commit the `.md` (source of truth) and regenerate the `.html` whenever it changes.
