# Phase 1 — Unified `.acp/` store + switchable task tracking

*Design locked 2026-06-22 (after clarifications). Implements the "task tracking" pillar from
[VISION.md](../VISION.md).*

## Goal

Track tasks **entirely in local markdown** (no Jira required), each linked to requirements and tests,
with status cross-checked against real verification — and the `mode` switch in place so Jira/hybrid can
plug in at Phase 3.

**Done when:** `katastasi task add/list/show/set/link/board/verify` works end-to-end in `mode: local`; an
agent can drive it via MCP; `mode: jira` imports issues read-only; `analyze` populates the task store; and
a task marked *done* whose requirements aren't verified is flagged ⚠️ drift (per the configured rule).

## Store layout (tidy `.acp/`, back-compatible, with `migrate`)

New writes go under a single hidden `.acp/` folder; the config stays at the repo root. Existing
root-level `requirements/`, `runs/`, `tech-analysis/` are **still read** if present (no breakage), and a
one-time `katastasi migrate` moves them in.

```
acp-trace.json            # config — unchanged, at root
.acp/
  tasks/   TASK-1.md …     # native tasks (flat, or <scope>/ when a scope sets a prefix)
  manifest.json           # id counters (per prefix); sync revisions added in Phase 3
  requirements/  …         # default write target (legacy root requirements/ still read)
  runs/    …               # default write target (legacy root runs/ still read)
  tech-analysis/ …         # analyze output (legacy root tech-analysis/ still read)
  BOARD.md                # generated kanban (on demand)
```

**Resolution rule** (`store.ts`): for `requirements`/`runs`/`tech-analysis`, prefer `.acp/<x>/` if it
exists, else legacy root `<x>/`, else default new writes to `.acp/<x>/`. `katastasi migrate` moves any
legacy root dirs into `.acp/` (idempotent; prints what moved). Defaults of `pull-requirements`, `analyze`,
and `trace` run-history switch to `.acp/`.

## Config additions (`acp-trace.json`)

```jsonc
{
  "scopes": [ { "name": "web", "taskPrefix": "WEB" /* optional → WEB-1 in .acp/tasks/web/ */ } ],
  "tasks": {
    "mode": "local",                                 // local | jira | hybrid(Phase 3)
    "dir": ".acp/tasks",
    "idPrefix": "TASK",                              // global default id prefix
    "statuses": ["todo", "in-progress", "blocked", "done"],
    "doneStatuses": ["done"],
    "verifyDone": true,                              // run the honesty cross-check
    "driftRule": "unverified",                       // unverified | strict | failing
    "jira": { "epic": "PROJ-1" }                     // mode: jira read-only import source
  }
}
```

## Task model (markdown is the source of truth)

Cardinality is **many-to-many**: a task may link several requirements; a requirement may have several
tasks.

```markdown
.acp/tasks/TASK-1.md
---
id: TASK-1
title: Implement login endpoint
status: in-progress
requirements: [PROJ-1, PROJ-2]   # many-to-many
tests: []                        # optional explicit links; coverage is otherwise DERIVED via requirements
assignee: ~                      # free text for now (Jira-mapped in Phase 3)
source: local                    # local | jira (jira = read-only cache)
created: 2026-06-22
updated: 2026-06-22
---
Description, checklist, notes.
```

- **IDs:** global `TASK-<n>` by default (flat in `.acp/tasks/`). If a scope sets `taskPrefix`, that
  scope's tasks use `<PREFIX>-<n>` and live in `.acp/tasks/<scope>/`. Counters live in `manifest.json`
  (one per prefix).
- **Coverage:** derived from each linked requirement's `@KEY`-tagged tests; the optional `tests:` field
  adds direct/extra links.

## The honesty cross-check (`verifyDone`, configurable `driftRule`)

A task links requirements; `trace` knows each requirement's state. A **done** task is flagged ⚠️ **drift**
per `driftRule`:

| `driftRule` | Drift when a done task… |
|---|---|
| `unverified` *(default)* | has any linked requirement not `verified` (specified/unverified/failing all count as not-proven) |
| `strict` | …that, **plus** flags a done task that links **no** requirements |
| `failing` | only when a linked requirement is actively `failing` |

A task with no requirements is not drift under `unverified`/`failing`. Surfaced in `task list`,
`task board`, MCP `task_list`, and `task verify --fail-on drift` (CI gate).

**Test results source:** by default reads the latest saved run in `.acp/runs/` (fast, offline; **warns if
the run is stale** vs HEAD). `task verify --run` re-runs the suites first for accuracy.

## Modes

- **`local`** *(full)* — Katastasi owns `.acp/tasks/*.md`.
- **`jira`** *(read-only import)* — `task import` (and `task list --refresh`) fetch issues under
  `tasks.jira.epic` into `.acp/tasks/*.md` marked `source: jira` (works offline after import). `task
  add`/`set`/`link` are **blocked with a clear message** in this mode; write-back is Phase 3.
- **`hybrid`** *(Phase 3)* — recognized in config; prints "available in Phase 3".

## CLI

```bash
katastasi task add "Implement login" --req PROJ-1 [--status todo]   # → TASK-<n> (or <PREFIX>-<n>)
katastasi task list [--status in-progress] [--req PROJ-1] [--drift] # table (+ ⚠️ drift)
katastasi task show TASK-1
katastasi task set TASK-1 --status done                             # validated vs tasks.statuses
katastasi task link TASK-1 --req PROJ-2 [--test path@KEY]
katastasi task board [--out .acp/BOARD.md]                          # markdown kanban (generated on demand)
katastasi task verify [--run] [--fail-on drift]                     # honesty gate
katastasi task import                                               # mode: jira read-only refresh
katastasi migrate                                                   # move legacy root dirs into .acp/
```

## MCP tools

`task_add`, `task_list`, `task_set_status`, `task_link`, `task_board` — agents create/move tasks and read
the drift signal, mirroring the CLI (blocked-in-jira-mode rules apply).

## Build plan (ordered, each step tested against `dist/` via `node --test`)

1. **Config** — `tasks` block + `scopes[].taskPrefix` in `config.ts` (zod + defaults).
2. **`store.ts`** — `.acp/` resolution + `katastasi migrate`.
3. **`tasks/model.ts`** — task markdown read/write (frontmatter), manifest + per-prefix id allocation.
4. **Task ops** — add / list / show / set / link (status validation; jira-mode read-only guard).
5. **`tasks/verify.ts`** — join tasks ↔ latest trace run (or `--run`) → derived state + `driftRule`.
6. **Board** — markdown kanban renderer (`.acp/BOARD.md`).
7. **CLI** — the `task` command group + `migrate`.
8. **MCP** — the task tools.
9. **Jira read-only import** — `tasks/importJira.ts` (reuse `jiraEpic`; cache as `source: jira` md).
10. **`analyze` hook** — `analyze` writes native `.acp/tasks/*.md` (linked to the requirement) in addition
    to the tech-analysis doc.
11. Tests for each step.

## Out of scope (later phases)

Two-way Jira/GitHub sync + `hybrid` (Phase 3) · the acceptance test runner (Phase 2) · a portal task board
(stretch / Phase 1.5).
