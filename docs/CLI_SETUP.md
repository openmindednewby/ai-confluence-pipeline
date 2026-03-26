# CLI Setup Guide

Run the AI analysis pipeline directly from your terminal — no Docker, no n8n, no API keys in `.env` needed. Just a CLI tool you're already authenticated with.

This is the recommended approach if you have the `claude` CLI or a GitHub Copilot subscription at work and want the simplest possible setup.

## How It Works

The standard pipeline makes **HTTP API calls** to AI providers (GitHub Models API, Anthropic API, etc.) from inside an n8n workflow running in Docker. The CLI approach **replaces that entire stack** with a single shell command:

```
Standard:  trigger.html → n8n (Docker) → HTTP POST to API → parse response → markdown
CLI:       script.sh    → claude -p  or  gh models run    → parse response → markdown
```

The prompt templates, JSON schemas, and markdown rendering are all identical — only the AI provider call is different. Output goes to the same `preview/` directory and is compatible with the same `push-to-confluence` scripts.

## Which CLI Should I Use?

| | GitHub Copilot CLI (`gh models`) | Claude Code CLI (`claude`) |
|---|---|---|
| **What it is** | GitHub CLI extension that runs AI models from the GitHub Models marketplace | Anthropic's CLI tool for interacting with Claude |
| **Authentication** | Your GitHub account (`gh auth login`) | Your Anthropic/Claude Code account |
| **Cost** | Free with GitHub account (rate-limited); higher limits with Copilot subscription | Included with Claude Code subscription |
| **Default model** | `anthropic/claude-4-opus` (Claude Opus via GitHub) | Uses your Claude Code default (e.g., `claude-opus-4-6`) |
| **Available models** | All GitHub Models marketplace models (GPT-5, Claude, Llama, DeepSeek, etc.) | Claude models only |
| **Best for** | Work environments with GitHub Copilot; switching between models | When you want Claude specifically and have Claude Code |
| **Rate limits** | 10 req/min, 50 req/day (free); higher with Copilot | Based on your Claude Code plan |
| **Requires** | `gh` CLI + `gh-models` extension + `jq` | `claude` CLI + `jq` |

**TL;DR:** Use `gh models` if you have GitHub Copilot at work. Use `claude` if you have Claude Code.

---

## Option A: GitHub Copilot CLI (`gh models`)

### What is `gh models`?

The [GitHub Models](https://github.com/marketplace?type=models) marketplace hosts AI models from multiple providers (OpenAI, Anthropic, Meta, etc.) and exposes them through a free API. The `gh-models` extension for the [GitHub CLI](https://cli.github.com/) lets you call these models from your terminal.

This is different from `gh copilot` (which is an interactive command-suggestion tool). `gh models run` sends a prompt to any model and returns the text response — perfect for scripting.

### Prerequisites

- **GitHub CLI** (`gh`) — [Install](https://cli.github.com/)
- **GitHub account** — logged in via `gh auth login`
- **GitHub Copilot subscription** (recommended for higher rate limits) or a free GitHub account (50 requests/day)
- **jq** — for JSON parsing in bash scripts ([Install](https://jqlang.github.io/jq/download/))

### Step 1: Install and verify

```bash
# Install the gh-models extension
gh extension install github/gh-models

# Verify it's installed
gh models list
```

You should see a list of models. Look for `anthropic/claude-4-opus` in the output.

### Step 2: Test a model

```bash
# Quick test — should return a response
gh models run anthropic/claude-4-opus "Say hello in JSON format"

# You can also use other models
gh models run openai/gpt-4.1 "Say hello in JSON format"
```

If you get a response, you're ready.

### Step 3: Run an analysis

```bash
# Basic — uses anthropic/claude-4-opus by default
./scripts/gh-models-preview.sh "Add user notification preferences"

# With a specific template
./scripts/gh-models-preview.sh "Document the payments service" --template service-documentation

# With additional context about your environment
./scripts/gh-models-preview.sh "Migrate auth to OAuth2" --template tech-migration --context "Currently using session cookies, PostgreSQL, Node.js"

# Override the model
./scripts/gh-models-preview.sh "Add feature X" --model openai/gpt-4.1
```

PowerShell:

```powershell
.\scripts\gh-models-preview.ps1 -Description "Add user notification preferences"
.\scripts\gh-models-preview.ps1 -Description "Document payments" -Template service-documentation
.\scripts\gh-models-preview.ps1 -Description "Migrate auth" -Template tech-migration -Context "Session cookies, PostgreSQL"
.\scripts\gh-models-preview.ps1 -Description "Add feature" -Model "openai/gpt-4.1"
```

### What happens under the hood

1. The script builds a prompt from the template (role + schema + your description)
2. Writes the prompt to a temp file
3. Pipes it to `gh models run <model> --system-prompt "<role>"`
4. Strips any markdown code fences from the response
5. Validates the JSON
6. Renders it as markdown
7. Saves both `.md` and `.json` to `preview/`

### Step 4 (optional): Use with n8n browser UI

If you run n8n **natively** (not in Docker), you can import `workflows/gh-models-cli-pipeline.json`. This workflow uses the Execute Command node to call `gh models run` instead of making HTTP requests. The browser form at `trigger.html` includes a "Preview via gh models CLI" option.

> **Docker note:** This does NOT work inside Docker because the `gh` CLI isn't available in the container. Use the standalone scripts instead, or run n8n natively with `npx n8n`.

---

## Option B: Claude Code CLI (`claude`)

### What is Claude Code?

[Claude Code](https://docs.anthropic.com/en/docs/claude-code) is Anthropic's CLI tool for interacting with Claude. When you run `claude -p "prompt"`, it sends the prompt to Claude and prints the response — no interactive session, no API keys to manage.

If you're reading this, you're probably already using Claude Code (this project was partly built with it). The `claude` CLI uses your existing authentication — no additional setup needed.

### Prerequisites

- **Claude Code** CLI installed — `npm install -g @anthropic-ai/claude-code`
- **Authenticated** — run `claude` interactively once to log in
- **jq** — for JSON parsing in bash scripts ([Install](https://jqlang.github.io/jq/download/))

### Step 1: Verify the CLI works

```bash
claude -p "Say hello" --output-format text
```

If this prints a response, you're ready.

### Step 2: Run an analysis

```bash
# Basic — uses your default Claude model
./scripts/cli-preview.sh "Add user notification preferences"

# With a specific template
./scripts/cli-preview.sh "Document the payments service" --template service-documentation

# With additional context
./scripts/cli-preview.sh "Migrate auth to OAuth2" --template tech-migration --context "Currently using session cookies"

# Specify model explicitly
./scripts/cli-preview.sh "Add feature X" --model claude-opus-4-6
```

PowerShell:

```powershell
.\scripts\cli-preview.ps1 -Description "Add user notification preferences"
.\scripts\cli-preview.ps1 -Description "Document payments" -Template service-documentation
.\scripts\cli-preview.ps1 -Description "Migrate auth" -Template tech-migration -Context "Session cookies"
.\scripts\cli-preview.ps1 -Description "Add feature" -Model claude-opus-4-6
```

### What happens under the hood

1. The script builds a prompt from the template (role + schema + your description)
2. Writes the prompt to a temp file
3. Pipes it to `claude -p --output-format text`
4. Strips any markdown code fences from the response
5. Validates the JSON
6. Renders it as markdown
7. Saves both `.md` and `.json` to `preview/`

### Step 3 (optional): Use with n8n browser UI

Import `workflows/cli-preview-pipeline.json` into n8n (native install only, not Docker). The browser form includes a "Preview via Claude CLI" option.

---

## Output

Both approaches produce identical output in the `preview/` directory:

```
preview/
  20260325-143022-user-notification-system.md    ← readable markdown (review/edit this)
  20260325-143022-user-notification-system.json   ← raw analysis JSON (used by push script)
```

The `.md` file includes:
- Title and generation metadata
- Complexity rating and suggested approach
- All analysis sections rendered as markdown headings, tables, and lists

The `.json` file contains the raw AI response — used by the push script to create Confluence pages and Jira tickets.

### Push to Confluence (after reviewing)

The CLI approach only replaces the AI call. Publishing to Confluence/Jira still uses the same push scripts and requires the Confluence/Jira config in `.env`.

```bash
# Push to Confluence only
./scripts/push-to-confluence.sh preview/20260325-143022-user-notification-system.json

# Push to Confluence + create Jira tickets
./scripts/push-to-confluence.sh preview/20260325-143022-user-notification-system.json --jira
```

```powershell
.\scripts\push-to-confluence.ps1 -File preview\20260325-143022-user-notification-system.json
.\scripts\push-to-confluence.ps1 -File preview\20260325-143022-user-notification-system.json -CreateJira
```

---

## Available Templates

All 16 templates work with both CLI approaches:

| Template | Category | Description |
|----------|----------|-------------|
| `generic` | General | Default technical analysis (architecture, APIs, database, tasks) |
| `new-feature` | Full pipeline | New feature design with full breakdown |
| `tech-migration` | Full pipeline | Phased migration plan with rollback strategy |
| `large-refactoring` | Full pipeline | Incremental refactoring with behavior preservation |
| `api-breaking-change` | Full pipeline | Contract diff, consumer impact, migration guide |
| `security-audit` | Full pipeline | Vulnerability report with severity scoring |
| `performance-optimization` | Full pipeline | Bottleneck analysis with benchmark targets |
| `scheduled-task-migration` | Full pipeline | Legacy job migration with discovery document |
| `adr` | Confluence only | Architecture Decision Record |
| `post-mortem` | Confluence only | Blameless incident post-mortem |
| `runbook` | Confluence only | Step-by-step operational procedures |
| `service-documentation` | Confluence only | Service/app/library documentation (key files, how to run, issues, improvements) |
| `bug-fix` | Jira only | Root cause analysis and fix ticket |
| `dependency-update` | Jira only | Dependency upgrade plan with breaking changes |
| `tech-debt` | Jira only | Tech debt documentation with business justification |
| `quick-enhancement` | Jira only | Small improvement with acceptance criteria |

---

## All Pipeline Options at a Glance

This project offers 5 ways to run the AI analysis. Here's how they compare:

| Pipeline | AI Provider | Requires | Files |
|----------|------------|----------|-------|
| **gh models CLI** | `gh models run` (GitHub Copilot) | `gh` CLI + extension | `scripts/gh-models-preview.sh/.ps1` |
| **Claude Code CLI** | `claude -p` (Claude Code) | `claude` CLI | `scripts/cli-preview.sh/.ps1` |
| **n8n Preview** (API) | GitHub Models REST API | Docker + n8n + `.env` | `workflows/preview-pipeline.json` |
| **n8n Direct Push** (free) | GitHub Models REST API | Docker + n8n + `.env` | `workflows/github-models-pipeline.json` |
| **n8n Direct Push** (paid) | Anthropic REST API | Docker + n8n + `.env` + API key | `workflows/technical-analysis-pipeline.json` |

**CLI pipelines** (top 2 rows): No Docker, no n8n, no API keys in `.env`. Just the CLI tool and a terminal. Output goes to `preview/`.

**n8n pipelines** (bottom 3 rows): Require Docker and n8n running. Support the browser form (`trigger.html`). The "Direct Push" variants create Confluence pages and Jira tickets automatically.

There are also n8n workflow variants for both CLIs (`workflows/cli-preview-pipeline.json` and `workflows/gh-models-cli-pipeline.json`) that use the Execute Command node. These only work with native n8n (not Docker) and are useful if you want the browser form without API keys.

---

## Troubleshooting

### `gh models run` hangs or returns empty

- Check `gh auth status` — make sure you're logged in
- Check `gh models list` — verify your account has access to the model
- Some models may not be available without a Copilot subscription
- Try a different model: `gh models run openai/gpt-4.1 "hello"`

### `gh models` extension not found

```bash
# Install it
gh extension install github/gh-models

# If that fails, update gh first
gh extension upgrade --all
```

### `claude -p` returns authentication error

- Run `claude` interactively first to log in
- Check your Claude Code subscription is active
- Try `claude --version` to verify the CLI is installed

### JSON parsing fails

- The scripts strip markdown code fences (`` ```json ... ``` ``) automatically
- If the AI still returns invalid JSON, the raw response is saved to `preview/failed-response.txt`
- Try again — LLMs occasionally produce malformed JSON on the first attempt
- Some templates with large schemas (e.g., `scheduled-task-migration`) need more tokens; the default 4096 max_tokens in the n8n workflows may truncate, but CLI scripts don't have this limit

### Script permission denied (bash)

```bash
chmod +x scripts/cli-preview.sh scripts/gh-models-preview.sh
```

### `jq` not found

```bash
# macOS
brew install jq

# Ubuntu/Debian
sudo apt install jq

# Windows (chocolatey)
choco install jq

# Windows (scoop)
scoop install jq
```

The PowerShell scripts (`.ps1`) do NOT require `jq` — they use `ConvertFrom-Json` natively.
