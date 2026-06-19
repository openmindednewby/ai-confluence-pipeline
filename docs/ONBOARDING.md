# RTM onboarding (5 minutes)

Get a team from nothing to a running, secured, CI-wired Requirements Traceability dashboard.

## Solo / try it (3 commands)

```bash
npm i -g ai-confluence-pipeline
acp trace init           # autodetects your test frameworks + a requirements source
acp trace serve          # → http://localhost:8787   (Run button, live updates)
```

`init` writes `acp-trace.json` (edit the globs/commands if a guess is off) and a `docs/requirements.md`
stub if you have no requirement source yet. Tag your tests with the requirement key (`@PROJ-1` in a
test title, or `[Trait("req","PROJ-1")]` in xUnit) and they light up the dashboard.

## Whole team (1 command + 1 up)

```bash
acp trace init --all     # config + a generated portal token (.env) + compose service + PR GitHub Action
docker compose -f docker-compose.trace.yml up -d
# open the URL it printed:  http://localhost:8787/?token=…
```

`--all` additionally:
- **generates `RTM_TOKEN`** into `.env` so the portal is safe to expose (every request needs the token);
- writes **`docker-compose.trace.yml`** — an always-on portal service (`restart: unless-stopped`, watches
  for result changes, storage stays in the repo's `runs/`);
- writes **`.github/workflows/rtm.yml`** — on every PR it runs the suites, **fails the check on a
  regression**, comments the RTM on the PR, and uploads the HTML dashboard.

Nothing is overwritten — existing files are kept (use `--force` to replace).

## Then

1. **Commit** `acp-trace.json` + `.github/workflows/rtm.yml` (not `.env`). PRs now get an RTM comment.
2. **Tag tests** with requirement keys (or list them in a `traceability.yml` mapping).
3. Point requirements at the real source when ready: `--jira-epic PROJ-100`, `--confluence-page <id>`,
   `--roadmap <file>`, or edit `acp-trace.json`.
4. Optional: a **team dashboard** that aggregates everyone's committed runs — see
   [DEPLOY.md](DEPLOY.md#2-team-git-backed-dashboard-shared-read-only). Notifications on regression:
   add `notify.webhook` to the config (see [TRACEABILITY.md](TRACEABILITY.md#notifications)).

## Mental model (why it's local-first)

Storage is each person's repo `runs/`, and every run is stamped with that checkout's git commit — so
"which requirements hold true" is answered *at a specific version*. Sharing happens through git
(commit `runs/`) or the read-only team dashboard. No central database; no code leaves anyone's machine
beyond what they push. Full reference: [TRACEABILITY.md](TRACEABILITY.md).
