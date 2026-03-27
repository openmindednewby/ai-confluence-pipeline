# Workflows Reference

This project includes 6 n8n workflows and 8 standalone scripts. This page documents each one — what it does, when to use it, and how.

## Quick Reference

### n8n Workflows (require Docker + n8n)

| Workflow | Webhook Path | What It Does | Docs |
|----------|-------------|-------------|------|
| [Preview Pipeline](#preview-pipeline) | `/webhook/preview` | Generate analysis → save as local markdown | [SETUP.md](SETUP.md) |
| [Iterative Preview](#iterative-preview-pipeline) | `/webhook/preview-iterative` | Generate → AI self-critique → refine → human feedback loop | This page |
| [GitHub Models Direct Push](#github-models-direct-push) | `/webhook/analyze` | Generate → Confluence page → Jira tickets (free) | [SETUP.md](SETUP.md) |
| [Anthropic Direct Push](#anthropic-direct-push) | `/webhook/analyze` | Same as above, using Anthropic API (paid) | [SETUP.md](SETUP.md) |
| [CLI Preview (Claude)](#cli-preview-workflow-claude) | `/webhook/preview-cli` | Preview using `claude` CLI via Execute Command | [CLI_SETUP.md](CLI_SETUP.md) |
| [CLI Preview (gh models)](#cli-preview-workflow-gh-models) | `/webhook/preview-gh` | Preview using `gh models run` via Execute Command | [CLI_SETUP.md](CLI_SETUP.md) |

### Standalone Scripts (no Docker, no n8n)

| Script | What It Does | Docs |
|--------|-------------|------|
| [gh-models-preview](#gh-models-preview) | Generate analysis via GitHub Copilot CLI | [CLI_SETUP.md](CLI_SETUP.md) |
| [cli-preview](#cli-preview) | Generate analysis via Claude Code CLI | [CLI_SETUP.md](CLI_SETUP.md) |
| [trigger-preview](#trigger-preview) | Trigger the n8n preview webhook from terminal | [SETUP.md](SETUP.md) |
| [trigger-analysis](#trigger-analysis) | Trigger the n8n direct-push webhook from terminal | [SETUP.md](SETUP.md) |
| [push-to-confluence](#push-to-confluence) | Push a preview JSON to Confluence + optionally Jira | [SETUP.md](SETUP.md) |
| [folder-to-jira](#folder-to-jira) | Create Jira Epic + Stories from markdown files | This page |
| [folder-to-confluence](#folder-to-confluence) | Create Confluence page from markdown files | This page |

---

## n8n Workflows (Detail)

### Preview Pipeline

**File:** `workflows/preview-pipeline.json`
**Webhook:** `POST /webhook/preview`
**AI Provider:** GitHub Models API (free)

Generates a technical analysis and returns it as markdown + JSON. Nothing is published — you review locally first.

**Flow:**
```
Webhook → Set Variables → Build Prompt → Call GitHub Models API → Parse JSON → Render Markdown → Respond
```

**Request body:**
```json
{
  "featureDescription": "Add user notifications",
  "additionalContext": "We use PostgreSQL",
  "template": "new-feature"
}
```

**Response:**
```json
{
  "success": true,
  "title": "User Notification System",
  "markdown": "# User Notification System\n...",
  "analysis": { /* raw JSON analysis */ }
}
```

**When to use:** Getting started, when you want to review AI output before publishing.

---

### Iterative Preview Pipeline

**File:** `workflows/iterative-preview-pipeline.json`
**Webhook:** `POST /webhook/preview-iterative`
**AI Provider:** GitHub Models API (free)

An enhanced version of the preview pipeline that automatically self-critiques and refines the analysis before returning it. Then supports a human feedback loop for further refinement.

**Flow (initial generation — 3 AI calls):**
```
Webhook → Build Prompt → Call API (generate)
       → Parse → Build Critique Prompt → Call API (critique)
       → Build Refine Prompt → Call API (auto-refine)
       → Parse → Render Markdown → Respond
```

**Flow (human refinement — 1 AI call):**
```
Webhook (with feedback) → Build Refine Prompt → Call API → Parse → Render Markdown → Respond
```

**Request body (initial):**
```json
{
  "featureDescription": "Add user notifications",
  "template": "new-feature"
}
```

**Request body (refinement):**
```json
{
  "action": "refine",
  "previousAnalysis": { /* the JSON from the previous response */ },
  "feedback": "Add more detail to the database section. Include pagination for the API.",
  "template": "new-feature",
  "iteration": 1
}
```

**Response (both modes):**
```json
{
  "success": true,
  "title": "User Notification System",
  "markdown": "# User Notification System\n...",
  "analysis": { /* refined JSON */ },
  "iteration": 1
}
```

**In the browser UI (`trigger.html`):**
1. Select "Iterative Preview" in the pipeline dropdown
2. Enter description and click Generate (takes 45-120 seconds — 3 AI passes)
3. Review the draft — it's already been self-critiqued
4. Type feedback in the text box and click **Refine** (15-60 seconds)
5. Repeat step 4 as many times as needed
6. Click **Approve & Finalize** when satisfied

**When to use:** When you want higher quality analysis and are willing to wait longer. Good for important features where accuracy matters.

**Note:** The initial generation makes 3 API calls (generate + critique + refine), so it counts as 3 toward your GitHub Models rate limit (50/day on free tier).

---

### GitHub Models Direct Push

**File:** `workflows/github-models-pipeline.json`
**Webhook:** `POST /webhook/analyze`
**AI Provider:** GitHub Models API (free)

One-step pipeline: generates analysis, creates a Confluence page, and optionally creates Jira tickets.

**Flow:**
```
Webhook → AI Generate → Parse → Format Confluence HTML → Create Page
       → If Jira enabled: Create Epic/Stories → Respond with URLs
```

**When to use:** After you've validated quality with the preview pipeline and trust the output.

---

### Anthropic Direct Push

**File:** `workflows/technical-analysis-pipeline.json`
**Webhook:** `POST /webhook/analyze`
**AI Provider:** Anthropic API (paid, ~$0.50-2/analysis)

Same as GitHub Models Direct Push but uses the Anthropic API directly for higher quality and no rate limits.

**When to use:** High volume (>50/day) or when you need the best possible Claude output.

---

### CLI Preview Workflow (Claude)

**File:** `workflows/cli-preview-pipeline.json`
**Webhook:** `POST /webhook/preview-cli`

Uses the Execute Command node to call `claude -p` instead of HTTP requests. Only works if n8n runs natively (not in Docker).

**When to use:** You want the browser UI but don't have API keys — just the `claude` CLI.

---

### CLI Preview Workflow (gh models)

**File:** `workflows/gh-models-cli-pipeline.json`
**Webhook:** `POST /webhook/preview-gh`

Uses the Execute Command node to call `gh models run` instead of HTTP requests. Only works if n8n runs natively (not in Docker).

**When to use:** You want the browser UI but only have GitHub Copilot CLI access.

---

## Standalone Scripts (Detail)

### gh-models-preview

**Files:** `scripts/gh-models-preview.sh`, `scripts/gh-models-preview.ps1`

Generates a technical analysis using the GitHub Copilot CLI (`gh models run`). No n8n needed.

```bash
./scripts/gh-models-preview.sh "Add user notifications"
./scripts/gh-models-preview.sh "Document payments" --template service-documentation
./scripts/gh-models-preview.sh "Migrate auth" --template tech-migration --context "Session cookies"
./scripts/gh-models-preview.sh "Add feature" --model openai/gpt-4.1
```

```powershell
.\scripts\gh-models-preview.ps1 -Description "Add user notifications"
.\scripts\gh-models-preview.ps1 -Description "Document payments" -Template service-documentation
```

**Output:** `preview/<timestamp>-<slug>.md` + `.json`

**Prerequisites:** `gh` CLI + `gh-models` extension + `jq`

See [CLI_SETUP.md](CLI_SETUP.md#option-a-github-copilot-cli-gh-models) for full setup.

---

### cli-preview

**Files:** `scripts/cli-preview.sh`, `scripts/cli-preview.ps1`

Generates a technical analysis using Claude Code CLI (`claude -p`). No n8n needed.

```bash
./scripts/cli-preview.sh "Add user notifications"
./scripts/cli-preview.sh "Document payments" --template service-documentation
./scripts/cli-preview.sh "Add feature" --model claude-opus-4-6
```

```powershell
.\scripts\cli-preview.ps1 -Description "Add user notifications"
```

**Output:** `preview/<timestamp>-<slug>.md` + `.json`

**Prerequisites:** `claude` CLI + `jq`

See [CLI_SETUP.md](CLI_SETUP.md#option-b-claude-code-cli-claude) for full setup.

---

### trigger-preview

**Files:** `scripts/trigger-preview.sh`, `scripts/trigger-preview.ps1`

Calls the n8n preview webhook and saves the response as local files. Requires n8n running.

```bash
./scripts/trigger-preview.sh "Add user notifications"
./scripts/trigger-preview.sh "Add user notifications" --context "We use PostgreSQL"
```

```powershell
.\scripts\trigger-preview.ps1 -Description "Add user notifications"
.\scripts\trigger-preview.ps1 -Description "Add user notifications" -Context "We use PostgreSQL"
```

**Output:** `preview/<timestamp>-<slug>.md` + `.json`

---

### trigger-analysis

**Files:** `scripts/trigger-analysis.sh`, `scripts/trigger-analysis.ps1`

Calls the n8n direct-push webhook. Creates Confluence page + Jira tickets in one step. Requires n8n running.

```bash
./scripts/trigger-analysis.sh "Add feature X"
./scripts/trigger-analysis.sh "Add feature X" --no-jira
./scripts/trigger-analysis.sh "Add feature X" --context "We use PostgreSQL"
```

```powershell
.\scripts\trigger-analysis.ps1 -Description "Add feature X"
.\scripts\trigger-analysis.ps1 -Description "Add feature X" -NoJira
```

---

### push-to-confluence

**Files:** `scripts/push-to-confluence.sh`, `scripts/push-to-confluence.ps1`

Takes a preview JSON file (from any preview script/workflow) and publishes it to Confluence. Optionally creates Jira tickets.

```bash
# Confluence only
./scripts/push-to-confluence.sh preview/20260324-143022-user-notifications.json

# Confluence + Jira tickets
./scripts/push-to-confluence.sh preview/20260324-143022-user-notifications.json --jira
```

```powershell
.\scripts\push-to-confluence.ps1 -File preview\20260324-143022-user-notifications.json
.\scripts\push-to-confluence.ps1 -File preview\20260324-143022-user-notifications.json -CreateJira
```

**Requires:** `.env` with `CONFLUENCE_*` (and `JIRA_*` if using `--jira`)

---

### folder-to-jira

**Files:** `scripts/folder-to-jira.sh`, `scripts/folder-to-jira.ps1`

Creates a Jira Epic + linked Stories directly from markdown files. You specify the exact files — one for the epic and one or more for tasks.

The epic file becomes a Jira Epic. Each task file becomes a Story with `parent` set to the epic key (so they appear linked in Jira boards).

```bash
# Specify exact files
./scripts/folder-to-jira.sh \
  --epic my-project/epic.md \
  --task my-project/task-api.md \
  --task my-project/task-db.md \
  --task my-project/task-ui.md

# Glob all task files
./scripts/folder-to-jira.sh --epic epic.md --task tasks/*.md

# Preview without creating anything
./scripts/folder-to-jira.sh --epic epic.md --task task-*.md --dry-run
```

```powershell
.\scripts\folder-to-jira.ps1 -Epic my-project\epic.md -Tasks my-project\task-api.md,my-project\task-db.md
.\scripts\folder-to-jira.ps1 -Epic epic.md -Tasks (Get-ChildItem task-*.md) -DryRun
```

**Markdown format:**

```markdown
# Task Title

Description text here. Multiple paragraphs supported.

## Acceptance Criteria
- Given X, when Y, then Z
- Given A, when B, then C

## Priority
High

## Estimate
M

## Component
backend

## Labels
auth, security
```

Only the `# Title` is required. All `##` sections are optional:

| Section | Maps to | Default |
|---------|---------|---------|
| `# Title` | Jira summary | Required |
| Body text | Jira description (ADF) | Empty |
| `## Acceptance Criteria` | Bullet list in description | None |
| `## Priority` | Jira priority field | `Medium` (from `.env`) |
| `## Estimate` | Added as label | None |
| `## Component` | Added as label | None |
| `## Labels` | Jira labels (comma-separated) | `n8n-pipeline-generated` |

**Requires:** `.env` with `JIRA_*` variables + `jq`

**Example files:** See `examples/epic-folder/` for a complete example with one epic and three tasks.

---

### folder-to-confluence

**Files:** `scripts/folder-to-confluence.sh`, `scripts/folder-to-confluence.ps1`

Creates a Confluence page from one or more markdown files. You specify a main page file and optional section files that get appended.

Markdown is converted to Confluence storage format HTML (headings, tables, code blocks with syntax highlighting, lists, bold/italic, links, blockquotes).

```bash
# Single file
./scripts/folder-to-confluence.sh --page docs/overview.md

# Main page + sections (combined into one Confluence page)
./scripts/folder-to-confluence.sh \
  --page docs/overview.md \
  --section docs/setup.md \
  --section docs/api-reference.md

# With options
./scripts/folder-to-confluence.sh \
  --page docs/overview.md \
  --section docs/setup.md \
  --title "My Service Documentation" \
  --parent 12345 \
  --labels "docs,api,platform"

# Preview without publishing
./scripts/folder-to-confluence.sh --page docs/overview.md --dry-run
```

```powershell
.\scripts\folder-to-confluence.ps1 -Page docs\overview.md
.\scripts\folder-to-confluence.ps1 -Page docs\overview.md -Sections docs\setup.md,docs\api.md
.\scripts\folder-to-confluence.ps1 -Page docs\overview.md -Title "My Docs" -Labels "docs,api" -DryRun
```

**Options:**

| Flag | Purpose | Default |
|------|---------|---------|
| `--page` | Main markdown file | Required |
| `--section` | Additional file to append (repeatable) | None |
| `--title` | Override page title | Extracted from first `# heading` |
| `--parent` | Confluence parent page ID (for nesting) | From `.env` |
| `--labels` | Comma-separated labels | `n8n-pipeline-generated` |
| `--dry-run` | Preview without creating | Off |

**Requires:** `.env` with `CONFLUENCE_*` variables + `jq` + `node` (for markdown→HTML)

**Example files:** See `examples/confluence-folder/` for a complete example with a main page and one section.

---

## Decision Guide: Which Pipeline Should I Use?

| I want to... | Use this |
|--------------|----------|
| Try it out quickly, no setup | `cli-preview.sh` or `gh-models-preview.sh` |
| Generate + review before publishing | Preview Pipeline or Iterative Preview |
| Get the best quality analysis | Iterative Preview Pipeline |
| Auto-create Confluence page + Jira tickets | Direct Push (GitHub Models or Anthropic) |
| Create Jira tickets from my own markdown | `folder-to-jira.sh` |
| Publish my own markdown to Confluence | `folder-to-confluence.sh` |
| Use it at work with only GitHub Copilot | `gh-models-preview.sh` |
| Use the browser form | Any n8n workflow + `trigger.html` |
