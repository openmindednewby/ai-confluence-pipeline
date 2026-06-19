# Requirements Traceability Matrix (RTM) — link tests ↔ requirements ↔ status

## Goal
Connect E2E + unit tests (across Playwright / Jest / Vitest / node:test / xUnit) to requirements
(Jira epics, roadmap.html, Confluence spec pages, or a markdown spec) so we can answer, **at a
specific git commit**, *which requirements actually hold true* — and emit a living report
(markdown + HTML) that can optionally be published to Confluence / roadmap / Jira via the existing
`acp` pipeline.

## Decisions (from the user)
- **Scope**: generic `acp trace` feature of ai-confluence-pipeline (tech-agnostic, config-driven). Works across orgs.
- **Requirement source**: pluggable + selectable per scope/epic — Jira epics, roadmap.html, Confluence page, markdown. Setup wizard (`acp trace init`).
- **Linking**: hybrid — inline tags (`@KEY` in titles, `[Trait("req","KEY")]` in xUnit) **and** an external mapping file.
- **Version-pinned**: every report stamped with git SHA + branch + dirty + timestamp.
- **Sinks**: configurable — canonical output is markdown + live HTML; publishing (Confluence page / roadmap section / committed RTM.md / Jira labels) is a separate step. Support **in-place section replacement** in existing docs via marker comments.

## Architecture (`src/core/trace/`)
- `types.ts` — Requirement, TestRef, TestResult, TraceConfig, TracedRequirement, TraceReport, state union.
- `gitContext.ts` — current SHA / branch / dirty / commit time (configurable repoDir).
- `testScanner.ts` — static scan of test sources across techs → key→TestRef[] (title tags, comment tags, xUnit Traits) + external mapping file (hybrid).
- `results/junit.ts`, `results/trx.ts` — parse JUnit XML (Playwright/Jest/Vitest) + dotnet TRX → key→status.
- `requirements/` — providers: `markdown.ts`, `roadmapHtml.ts`, `jiraEpic.ts` (reuse atlassian.ts), `confluencePage.ts` (getPage + storageToMarkdown).
- `computeState.ts` — join requirements + refs + results → state (verified / failing / unverified / specified) + drift flag + orphan tests.
- `report/markdown.ts`, `report/html.ts`, `report/json.ts` — canonical outputs.
- `sectionUpdater.ts` — idempotent `<!-- acp:trace:start id -->…<!-- acp:trace:end -->` section replacement.
- `config.ts` — load + validate `acp-trace.json` (zod), normalize scopes.
- `index.ts` — `runTrace(config)` orchestrator.

## Surfaces
- CLI: `acp trace [--config acp-trace.json]`, `acp trace init` (wizard).
- MCP: `requirements_trace` tool.

## State model
| State | Meaning |
|-------|---------|
| ✅ verified | tests reference it AND all referencing tests pass |
| ❌ failing | referencing tests exist but some fail |
| 🧪 unverified | tests reference it but no results ingested (not run) |
| 📋 specified | requirement exists, zero tests reference it |
| ⚠️ drift | declared Done/complete but not verified (the money signal) |
| 👻 orphan-test | a test tags a key with no matching requirement |

## Batches
1. ✅ Offline engine: types, git, scanner, junit/trx, computeState, reports, sectionUpdater (+ tests).
2. ✅ Requirement providers + config + orchestrator (+ tests).
3. ✅ CLI (`trace` + `trace init`) + MCP tool (`requirements_trace`) + publish sinks + docs.

## Status: COMPLETE
- 71/71 tests pass (`npm test`), `npm run typecheck` clean.
- CLI smoke-tested end-to-end: markdown spec + scanned Playwright test + JUnit results →
  PROJ-1 verified, PROJ-2 drift (declared done, no test), PROJ-3 failing, PROJ-404 orphan,
  coverage 33%, `--fail-on drift` exits 1. markdown + HTML + JSON written.
- New files under `src/core/trace/` (types, git, glob, testScanner, results, computeState,
  sectionUpdater, config, publish, index, `requirements/*`, `report/*`); CLI + MCP wired;
  tests `test/trace*.test.js`; docs `docs/TRACEABILITY.md` + README + CLI_AND_MCP.

## v2 — regression pipeline (COMPLETE)
Turned the static RTM into a re-runnable regression system (per user request):
- **Execution**: optional per-suite `command` + `acp trace --run` (`runner.ts`).
- **History + regressions**: git-stamped run snapshots in `runs/`, diff vs previous/baseline →
  ⛔ regressions (verified→failing) + improvements (`history.ts`); shown in markdown + HTML +
  CLI summary; `--fail-on regression` gate.
- **Portal**: `acp trace serve` — dependency-free web dashboard + Run button + history + JSON API
  (`GET /`, `/api/report`, `/api/runs`, `POST /run`) (`serve.ts`).
- **Triggers**: CLI/CI, portal, MCP (`requirements_trace { run }`), n8n webhook (`POST /run`); each
  run can refresh outputs + roadmap section + Confluence page.
- **Onboarding**: autodetect wizard (`autodetect.ts`) — `acp trace init` scans frameworks + results +
  requirements source, writes a ready config + a `docs/requirements.md` stub.
- 82/82 tests pass; typecheck clean; portal + run→save→diff + autodetect smoke-tested end-to-end.

## v3 — follow-ups CLEARED (all 5)
Done one at a time, each with docs + README roadmap updated:
1. **Live Atlassian verification** — `scripts/verify-atlassian.{sh,ps1}` (read-only pull + dry-run push)
   + opt-in `test/atlassian.live.test.js` (skips without creds + `RTM_LIVE_EPIC`/`RTM_LIVE_PAGE`).
2. **Portal visual QA** — `scripts/preview-rtm.mjs` sample generator (every state + regression + orphan)
   + `docs/VISUAL_QA.md` checklist + static element check. (Live Chrome eyeball = documented manual step;
   extension not connectable here.)
3. **Auto-refresh + watch** — SSE `GET /events`; dashboard reloads on any change; `acp trace serve --watch`
   re-traces on an interval; local compose runs `--watch`.
4. **Jira label stamping** — `modifyIssueLabels` + `planJiraLabelStamp`/`stampJiraLabels`;
   `acp trace --stamp-jira` / portal `POST /run?stamp=1`.
5. **n8n scheduled regression** — `workflows/rtm-scheduled-regression.json` (nightly `POST /run?run=1`
   → branch on `stats.regressions`).
- 88 tests (86 pass, 2 skip-offline); typecheck clean. Commits d50eaab→(item5).

## Still genuinely open (need external resources)
- A full live Atlassian round-trip RUN (needs real creds) — tooling is ready, just unexercised here.
- A live in-browser visual pass (needs a connected Chrome extension).

## Verification
`npm test` (build + node --test). All pure/local pieces fixture-tested offline; Jira/Confluence providers reuse the mock-tested REST client.
