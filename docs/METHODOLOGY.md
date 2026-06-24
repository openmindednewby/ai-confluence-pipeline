# Applying Katastasi — a team methodology

How to fold Katastasi into day-to-day delivery. The throughline: **every feature has one honest status**,
and the path from *a Jira epic* to *verified, merged code* is the same repeatable loop — driven by the
developer, an AI agent, or both.

## One-time setup (per repo)

```bash
npx katastasi trace init        # autodetect tests + requirements → acp-trace.json
npx katastasi init-skills       # drop Claude/Copilot skills into this repo
```

Then in `acp-trace.json` add (as needed):
- **sources** — the Jira epic / Confluence page / markdown your requirements live in,
- a **`sync` binding** — `.acp/tasks ⇄ GitHub issues / Jira` (+ a `statusMap`; `mergeStrategy: "field-merge"`),
- a **`wizard.fixtures`** map — real ids so the generated curls are copy-paste runnable.

Credentials live in a local `.env` (`JIRA_*` / `CONFLUENCE_*` / `GITHUB_TOKEN`) — see
[SOURCES_SETUP.md](SOURCES_SETUP.md). Nothing leaves the machine.

## The per-feature loop

```
ONBOARD → DESIGN → IMPLEMENT → VERIFY → SYNC
```

| Step | Who | Command | Output |
|------|-----|---------|--------|
| **1. Onboard** | lead / dev | `katastasi web` → paste the Jira/Confluence URL → confirm what's discovered → download | requirements as markdown in `.acp/requirements/` |
| **2. Design** | lead (AI) | the wizard's Design step (or `katastasi wizard --feature "…" --db-changes`) | a **feature pack**: system data-flow diagram, **DB/migration changes**, dependency-ordered tasks, test stubs, ready-made curls |
| **3. Implement** | dev + agent | agent reads `.acp/tasks/<KEY>.md` (code + Jira + Confluence context inline) | code, in dependency order |
| **4. Verify** | agent first, then dev | `katastasi test` → `katastasi trace` | each requirement ✅ verified / ❌ failing at the commit; the dev runs the curls to confirm |
| **5. Sync** | agent / on-merge | `katastasi sync --apply` | task status flows back to Jira/GitHub; conflicts flagged, never lost |

The developer's job shrinks to **read the data-flow diagram, approve it, run the ready-made curls, confirm**.
Agents do steps 3–4 first; the human signs off.

## Where it slots into your existing process

- **Pull requests** — `katastasi trace --run --fail-on regression` as a CI gate: a PR can't merge if a
  previously-verified requirement broke. A done task whose requirement isn't verified fails
  `katastasi task verify --fail-on drift`.
- **On merge** — run `katastasi sync --apply` (a git `post-merge` hook, a CI step, or an agent via the
  `katastasi-sync` skill) so Jira status reflects reality automatically.
- **Requirement changes** — re-run the wizard; it shows a **diff** of what moved (tasks/diagrams added or
  changed) instead of a blind regenerate.
- **DB migrations** — the feature pack's "Database / migration changes" section is the production checklist;
  carry it into the migration PR.

## Roles

- **Tech lead / BA** — runs the wizard, reviews the system design + DB changes, approves the task plan.
- **Developers** — implement the ordered, context-rich tasks; run the curls to verify.
- **AI agents (Claude / Copilot)** — drive every step via the installed skills (`onboard / design / sync /
  trace / test / tasks`); they implement and self-verify before handing back.
- **`acp trace`** — the source of truth for "is this *really* done", at the git commit.

## Adopting it gradually

1. Start with **trace** on one service — tag a few tests, see real verified/failing status. Low effort, immediate signal.
2. Add **tasks** + the **wizard** for the next feature — the team feels the "everything-inline" task quality.
3. Turn on **sync** once tasks are trusted — pick GitHub Issues first if that's where your team lives.
4. Install the **skills** everywhere (`katastasi init-skills` per repo) so the AI tools speak Katastasi.

Extract on the second use, not the first: only wire a source/binding when a real feature needs it.
