# AI Confluence Pipeline

Automate technical analysis with AI, push it to Confluence, and create Jira tasks — all in one workflow.

Built for **tech leads** who spend too much time writing technical docs and creating tickets manually.

```
Feature Description → AI Analysis → Confluence Page → Jira Tasks
```

## What It Does

1. You describe a feature, bug, or research spike
2. AI (Claude or OpenAI) generates a structured technical analysis:
   - Architecture overview with component breakdown
   - API contracts with request/response examples
   - Database schema changes
   - Edge cases and security considerations
   - Testing strategy
   - Task breakdown with acceptance criteria
3. Creates a formatted Confluence page with the full analysis
4. Creates Jira tickets for each task, linked back to the Confluence page

## Quick Start

```bash
# 1. Clone
git clone https://github.com/openmindednewby/ai-confluence-pipeline.git
cd ai-confluence-pipeline

# 2. Configure
cp .env.example .env
# Edit .env with your API keys (see docs/SETUP.md)

# 3. Start n8n
docker compose up -d

# 4. Import workflow
# Open http://localhost:10353 → Import → workflows/technical-analysis-pipeline.json

# 5. Run it
./scripts/trigger-analysis.sh "Add user notification preferences with email and push channels"
```

## Example Output

**Input:**
> "Add user notification preferences with email, push, and in-app channels. Users should be able to configure which events trigger notifications and through which channels."

**Output:**
- Confluence page with architecture, API specs, database changes, edge cases, and task breakdown
- 6-8 Jira tickets with acceptance criteria, estimates, and component labels

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐     ┌─────────┐
│   Trigger    │────▶│  Claude AI   │────▶│  Confluence   │────▶│  Jira   │
│  (webhook)   │     │  (analysis)  │     │  (page)       │     │ (tasks) │
└─────────────┘     └─────────────┘     └──────────────┘     └─────────┘
       │                    │                    │                   │
       │              Structured            Formatted           Tickets
       │              JSON output           HTML page          with AC
       │                                                     & estimates
  Feature desc,
  options, context
```

**Orchestrated by n8n** (self-hosted, open-source workflow automation).

## Template Registry

Not every scenario needs the same output. The template registry routes each type of work to the right destination.

### Full Pipeline (Confluence + Jira)

| Template | Use Case | Jira Structure |
|----------|----------|----------------|
| [New Feature](templates/full-pipeline/new-feature.md) | Feature implementation | Epic + Stories |
| [Tech Migration](templates/full-pipeline/tech-migration.md) | Stack/library migration | Phased Epics |
| [Large Refactoring](templates/full-pipeline/large-refactoring.md) | Major code restructuring | Epic + Stories |
| [API Breaking Change](templates/full-pipeline/api-breaking-change.md) | Contract changes with consumer impact | Epic + Stories |
| [Security Audit](templates/full-pipeline/security-audit.md) | Vulnerability findings + remediation | Epic + Stories |
| [Performance Optimization](templates/full-pipeline/performance-optimization.md) | Bottleneck analysis + fix plan | Epic + Stories |

### Confluence Only (Documentation, no tickets)

| Template | Use Case |
|----------|----------|
| [ADR](templates/confluence-only/adr.md) | Architecture Decision Records |
| [Post-Mortem](templates/confluence-only/post-mortem.md) | Incident reports (blameless) |
| [Runbook](templates/confluence-only/runbook.md) | Operational procedures for on-call |

### Jira Only (Quick tickets, no docs)

| Template | Use Case | Jira Structure |
|----------|----------|----------------|
| [Bug Fix](templates/jira-only/bug-fix.md) | Bug report → ticket | Single Bug ticket |
| [Dependency Update](templates/jira-only/dependency-update.md) | Package upgrades | Story + Subtasks |
| [Tech Debt](templates/jira-only/tech-debt.md) | Tech debt backlog items | Single Story |
| [Quick Enhancement](templates/jira-only/quick-enhancement.md) | Small improvements (<1 day) | Single Story |

### Active n8n Prompts

The prompts in `prompts/` are what the current n8n workflow uses. The templates above are the next-gen format (same concepts, more structured):

| Template | Use Case |
|----------|----------|
| [Technical Analysis](prompts/technical-analysis.md) | New features (original format) |
| [Bug Analysis](prompts/bug-analysis.md) | Bug reports (original format) |
| [Spike Analysis](prompts/spike-analysis.md) | Research/evaluation (original format) |

## Workflows

### Preview First (Recommended)

Generate analysis as local markdown files, review/edit, then push to Confluence when ready.

```bash
# Step 1: Generate preview
./scripts/trigger-preview.sh "Add user notification preferences"
# → Saves preview/20260324-143022-user-notifications.md   (review this)
# → Saves preview/20260324-143022-user-notifications.json (data for push)

# Step 2: Review and edit the markdown in your editor

# Step 3: Push to Confluence
./scripts/push-to-confluence.sh preview/20260324-143022-user-notifications.json

# Step 3 (with Jira tickets):
./scripts/push-to-confluence.sh preview/20260324-143022-user-notifications.json --jira
```

```powershell
# PowerShell
.\scripts\trigger-preview.ps1 -Description "Add user notification preferences"
.\scripts\push-to-confluence.ps1 -File preview\20260324-143022-user-notifications.json
.\scripts\push-to-confluence.ps1 -File preview\20260324-143022-user-notifications.json -CreateJira
```

Import `workflows/preview-pipeline.json` into n8n for this workflow.

### Direct Push (Original)

Skip preview, push directly to Confluence and create Jira tickets in one step.

```bash
./scripts/trigger-analysis.sh "Add feature X"
./scripts/trigger-analysis.sh "Add feature X" --no-jira
./scripts/trigger-analysis.sh "Add feature X" --context "We use PostgreSQL"
```

```powershell
.\scripts\trigger-analysis.ps1 -Description "Add feature X"
.\scripts\trigger-analysis.ps1 -Description "Add feature X" -NoJira
```

Import `workflows/github-models-pipeline.json` (free) or `workflows/technical-analysis-pipeline.json` (Anthropic) for this workflow.

## Team Context Profiles

Inject your team's tech stack, conventions, and project management config into every prompt. This makes AI output specific to your environment instead of generic.

```bash
# Copy the example and customize
cp team-profiles/example.json team-profiles/my-team.json
```

The profile includes your stack, API conventions, estimation scales, Jira config, Confluence spaces, and service inventory. See [team-profiles/example.json](team-profiles/example.json) for the full structure and [team-profiles/profile.schema.json](team-profiles/profile.schema.json) for the schema.

> **Status:** Profile schema and examples are ready. Automatic injection into n8n prompts is the next development step — for now, copy relevant sections from your profile into the `additionalContext` field when triggering.

## Customization

See [docs/CUSTOMIZATION.md](docs/CUSTOMIZATION.md) for:
- Writing custom prompt templates
- Injecting your tech stack context
- Confluence page formatting and macros
- Jira custom fields, epic linking, sprint assignment
- Adding Slack notifications
- Batch processing multiple features

## Requirements

- Docker & Docker Compose
- Confluence Cloud + API token
- Jira Cloud + API token (optional)
- **AI provider (choose one — see table below)**

### AI Provider Options

You do NOT need a paid API key. GitHub Models API is free with any GitHub account.

| Provider | Cost | What You Need | Best For |
|----------|------|---------------|----------|
| **GitHub Models API** | **Free** (rate-limited) | GitHub account + Personal Access Token | Getting started, low volume |
| GitHub Models + Copilot | Copilot subscription ($10-39/mo) | Higher rate limits than free tier | Regular use |
| Anthropic API | Pay-per-use (~$3-15/MTok) | API key from console.anthropic.com | High volume, best quality |
| OpenAI API | Pay-per-use (~$2.50-10/MTok) | API key from platform.openai.com | High volume, alternative |

**Recommended starting point:** GitHub Models API (free) with `anthropic/claude-4-opus` or `openai/gpt-4o`. See [docs/GITHUB_MODELS_SETUP.md](docs/GITHUB_MODELS_SETUP.md) for setup.

## FAQ

**Can I use this without paying for an API key?**
Yes. The GitHub Models API is free for all GitHub accounts (rate-limited to ~50-150 requests/day depending on model). Just create a Personal Access Token with `models:read` scope. See [docs/GITHUB_MODELS_SETUP.md](docs/GITHUB_MODELS_SETUP.md).

**Can I use my Copilot subscription instead of an API key?**
Not directly — Copilot is an IDE tool without a general-purpose REST API. However, a Copilot subscription gives you higher rate limits on the GitHub Models API, which IS a REST API this pipeline can use. So a Copilot subscription helps indirectly.

**Can I use OpenAI instead of Claude?**
Yes. Change `AI_PROVIDER=openai` in `.env` and modify the "Call Claude API" node to use the OpenAI messages endpoint. The prompt templates work with any model.

**Does this work with Confluence Server (on-premise)?**
Yes, but the API endpoints differ slightly. Confluence Server uses `/rest/api/content` without the `/wiki` prefix. Update the URL in the n8n node.

**Can I use this without Jira?**
Yes. Pass `createJiraTasks: false` or use the `--no-jira` flag. You'll still get the Confluence page.

**Can I run this without Docker?**
Yes. Install n8n globally with `npm install -g n8n`, then `n8n start`. Import the workflow the same way.

**Is n8n free?**
Yes, for self-hosted use. n8n uses a "fair-code" license (Sustainable Use License) — free to self-host internally with no user, workflow, or execution limits. You only need a paid license if you resell it or offer it as a hosted service. For running this pipeline on your own machine or your company's server, it's completely free. If your company has strict OSS-only policies, see [Alternatives to n8n](#alternatives-to-n8n) below.

**How do I add this to a CI/CD pipeline?**
Trigger the webhook from your CI — e.g., when a specific label is added to a GitHub issue, a GitHub Action calls the webhook with the issue body.

### Alternatives to n8n

If you need a fully open-source alternative or prefer a different tool:

| Tool | License | Notes |
|------|---------|-------|
| **n8n** (used here) | Fair-code (free self-hosted) | Best UI, most integrations, easiest setup |
| **Activepieces** | MIT | Fully open-source, similar visual workflow builder |
| **Windmill** | AGPLv3 | More developer-focused, script-based workflows |
| **Plain scripts** | N/A | The prompt templates and API calls work without any workflow tool — just use the trigger scripts directly |

The workflow JSON, prompt templates, and trigger scripts in this repo are all MIT-licensed regardless of which orchestration tool you use.

## Roadmap

See [docs/NEXT_STEPS.md](docs/NEXT_STEPS.md) for the full roadmap.

**Done:**
- 13 prompt templates across 3 categories (full-pipeline, confluence-only, jira-only)
- Template registry with JSON Schema validation
- Team context profiles with schema and example

**Next up:**
- **Template routing in n8n** — wire the registry so `--template` flag selects the right prompt and output routing
- **Confluence page templates** — polished layouts with macros, panels, and TOC per template type
- **Jira structure support** — epic-with-stories, phased-epics, story-with-subtasks in n8n
- **Smart template selection** — AI auto-detects the best template from the description
- **CLI tool** — `acp analyze --template new-feature "Add notifications"`

## Contributing

Contributions welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide.

The [template registry](templates/registry.json) is the easiest place to start — even adding a single new template helps. See [docs/NEXT_STEPS.md](docs/NEXT_STEPS.md) for the priority list and [docs/CUSTOMIZATION.md](docs/CUSTOMIZATION.md) for how templates work.

## License

MIT — see [LICENSE](LICENSE).
