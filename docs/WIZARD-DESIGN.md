# Feature Lifecycle Wizard — design

*Scoped 2026-06-24. A super-simple guided flow that turns a feature idea (+ its Jira/Confluence
requirements + the existing code) into a **dev-ready package** an agent or a junior dev can execute
without thinking hard — and a one-page **HTML "feature pack"** the developer just reads, approves, and
verifies. Built on the existing `pull-requirements` / `analyze` / `task` / acceptance machinery.*

## 1. The experience (what "done" feels like)

```
$ katastasi wizard
  1. Source?            Jira  ·  Confluence  ·  both  ·  none (markdown only)
  2. Requirements?      create new  ·  pull existing (one or many)  ·  start clean
  3. Analyze            → system data-flow mermaid + per-endpoint/use-case mermaid + gap analysis
  4. Tasks              → ordered, context-rich (code + Jira + Confluence) so a low-IQ model can execute
  5. Evaluation pack    → unit + Playwright e2e + acceptance stubs, ready-made curls (real ids w/ data)
  6. Publish            → markdown docs  +  Confluence page

  → .acp/features/<feature>/feature-pack.html
```

**The developer's job shrinks to:** open `feature-pack.html`, read the mermaid data-flow, **approve it**
(one click), run the **ready-made curls** (copy button, real ids), tick **verify**. Agents do this first;
the human just confirms. Re-run on a **requirement change** and the pack updates with a diff.

## 2. Locked decisions (from the 2026-06-24 scoping Q&A)

| Dimension | Decision |
|---|---|
| Form factor | **CLI wizard → self-contained HTML feature-pack** (interactive in a TTY; flag-driven otherwise, so it's scriptable + testable). Reuses the `_tools` / `questions` offline-HTML pattern. |
| What it does | **Generates** the dev-ready package (mermaid, ordered enriched tasks, test stubs, ready-made curls, docs). The coding **agent + developer execute & verify** — the wizard is the prep, not the code-doer. |
| Sources | **Jira + Confluence + none, all live.** Reuses the existing Atlassian REST clients; `none` = pure local markdown (no account). First-time auth in **[SOURCES_SETUP.md](SOURCES_SETUP.md)**. |
| Output | Both **markdown** (`.acp/features/<feature>/`) **and Confluence** (publish the tech-analysis page). |
| Build | **Slice 1 now** (orchestrator + feature-pack shell over today's pipeline), then the new bits phase by phase. |

## 3. The steps in detail

### Step 1 — Source
`--source jira|confluence|both|none`. For jira/confluence the wizard first runs a **credential check**
(`katastasi wizard check`) and, if creds are missing, prints the exact first-time-auth steps
([SOURCES_SETUP.md](SOURCES_SETUP.md)) instead of failing. `none` needs nothing.

### Step 2 — Requirements
- **create new** — scaffold `docs/requirements.md` (or `.acp/requirements/<key>.md`) from a one-line idea.
- **pull existing** — `pull-requirements` from the configured sources (Jira epic / Confluence page /
  GitHub-GitLab issues / markdown), **one or many**, into `.acp/requirements/`. Supports a mix.
- **start clean** — empty requirement set; the wizard helps you write the first ones.

### Step 3 — Analyze (the heart)
Runs `analyze` over **all requirements + Jira tickets + the existing code** and produces:
- a **full-system data-flow mermaid** (how data moves across the system), and
- **per-endpoint / per-use-case mermaid** diagrams (one flow each), and
- the gap analysis (implemented / partial / missing, citing files).

### Step 4 — Tasks (ordered + enriched)
Create native `.acp/tasks` from the stories **or update existing ones**, then:
- **order** them by dependency (what must exist before what), and
- **enrich** each with the context an executor needs: linked requirement(s), the relevant **code files**,
  the **Jira** ticket, the **Confluence** section, the acceptance criteria, and the mermaid it implements —
  so even a low-capability model has everything inline.

### Step 5 — Evaluation pack
- **unit** + **Playwright e2e** + **acceptance** (`acp-test`) stubs, tagged by requirement key.
- **ready-made curls** — per endpoint, with **real ids that have data** (sourced per §6 Q2), copy-paste
  runnable, so verifying is "paste and look."
- Order: agents implement → run the tests/curls → only then is the FE doc + curls handed to the human.

### Step 6 — Publish
Write the markdown pack under `.acp/features/<feature>/` **and** publish the technical-analysis page to
**Confluence** (live). The `feature-pack.html` links both.

### The HTML feature-pack
One self-contained page (offline, vendored mermaid) with: Overview · **System data-flow** (mermaid) ·
**Use-case diagrams** · **Tasks** (ordered, each expandable with its full context + an *approve* tick) ·
**Tests** · **Curls** (copy button + *verify* tick) · Doc links. Approvals/verifications persist to
`localStorage` (like `_tools`), and **export to markdown** for the record.

## 4. Build plan (phased)

**Slice 1 (now) — the working spine:**
1. **Wizard orchestrator** (`src/core/wizard/`) — a pure `runWizard(config, baseDir, opts)` that resolves
   source → gathers/creates requirements → runs `analyze` (injectable AI) → creates+orders tasks →
   assembles a `FeaturePack` data object. Network-free testable on `source: none`.
2. **Feature-pack HTML generator** — `FeaturePack` → one self-contained page (system + use-case mermaid,
   ordered tasks, test list, curl placeholders, approve/verify ticks, localStorage, export).
3. **CLI `katastasi wizard`** — interactive (Node `readline`, no dep) in a TTY; flag-driven otherwise
   (`--source`, `--feature`, `--requirements new|pull|clean`, `--no-analyze`, `--publish-confluence`).
   Plus `katastasi wizard check` (credential doctor) + **[SOURCES_SETUP.md](SOURCES_SETUP.md)**.

**Later phases (scoped, each its own slice):**
4. **Per-endpoint data-flow mermaid** — extend `analyze` to emit a system diagram + one diagram per
   endpoint/use-case (not just per-task flow).
5. **Task ordering + agent-context enrichment** — dependency ordering + inline code/Jira/Confluence refs.
6. **Ready-made curl generation** — per endpoint, with real ids (id-sourcing per §6 Q2).
7. **Approve/verify surface polish** + **export-to-markdown** of the sign-off.
8. **Requirement-change diff** — re-run detects changed requirements and shows what moved (tasks/tests/
   diagrams added/changed/removed) instead of a blind regenerate.

## 5. Out of scope (for now)
Executing the code/tests/curls itself (the wizard generates; agent+dev run — per the locked decision);
a hosted multi-user wizard service; auto-seeding test data; bidirectional task sync (that's Phase 3).

## 6. Open sub-questions to resolve at build-start of each later phase
1. **Per-endpoint mermaid depth** — sequence diagrams (request→service→db→response) vs flowcharts? One per
   REST endpoint, or per use-case (which may span endpoints)?
2. **Curl id-sourcing** — where do "real ids that have data" come from: a configured fixtures file, a
   read-only GET against a seeded env, or placeholders the dev fills? (Proposed: a `wizard.fixtures` map +
   placeholders fallback.)
3. **Task ordering heuristic** — explicit `dependsOn` in the analyze output vs inferred from
   requirement/code references vs topological from endpoint call-graph?
4. **E2E framework** — assume Playwright (repo default) or read it from the trace config's test techs?
5. **Requirement-change diff** — diff requirements by key+content hash (proposed) and re-analyze only the
   touched slice, vs full regenerate with a changelog?
6. **Feature-pack location & naming** — `.acp/features/<slug>/` (proposed); committed or git-ignored?
7. **Confluence layout** — one page per feature with child pages per use-case, or a single page?
