# Contributing

Thanks for your interest in contributing. This project is designed to be easy to extend — especially the template system.

## Quick Wins (Great First Contributions)

1. **Add a new template** — see [Adding a Template](#adding-a-template) below
2. **Improve an existing prompt** — test it, find where the AI output is weak, refine the instructions
3. **Add a team profile** — share your anonymized team profile as an example
4. **Fix docs** — typos, unclear instructions, missing steps

## Adding a Template

This is the most impactful contribution. Here's how:

### 1. Pick the right category

| Category | When to use | Creates |
|----------|------------|---------|
| `full-pipeline/` | Needs documentation AND tickets | Confluence page + Jira tickets |
| `confluence-only/` | Needs documentation only | Confluence page |
| `jira-only/` | Needs tickets only | Jira tickets |

### 2. Create the template file

```bash
# Example: adding a "database migration" template
touch templates/full-pipeline/database-migration.md
```

### 3. Follow the template structure

Every template file has 3 sections:

```markdown
# Template Name — Subtitle

## System Prompt
The AI's role and constraints.

## User Prompt
The structured prompt with {{featureDescription}} placeholder and JSON output schema.
```

Key rules for the JSON schema:
- Define every field the AI should output
- Include field descriptions so the AI knows what each field means
- Add example values where the format matters (dates, enums, etc.)
- End with a `## Rules` section — numbered constraints that keep output focused

### 4. Register it

Add an entry to `templates/registry.json`:

```json
{
  "id": "database-migration",
  "name": "Database Migration",
  "description": "Schema migration plan with rollback strategy and data verification",
  "category": "full-pipeline",
  "prompt": "templates/full-pipeline/database-migration.md",
  "output": {
    "confluence": true,
    "jira": true,
    "confluenceTemplate": "migration-plan",
    "jiraStructure": "epic-with-stories",
    "confluenceLabels": ["technical-analysis", "database", "migration"],
    "jiraLabels": ["database", "migration"],
    "defaultPriority": "High"
  }
}
```

### 5. Test it

Run the prompt manually against Claude or GPT-4 and verify:
- Output is valid JSON (no markdown fences, no extra text)
- All fields are populated with realistic content
- Tasks have proper acceptance criteria
- The output is specific to the input, not generic boilerplate

### 6. Submit your PR

Include:
- The template file
- Updated `registry.json`
- A brief note on what scenarios this template covers

## Improving Existing Prompts

The most common issues with AI prompts:

| Problem | Fix |
|---------|-----|
| Generic output | Add more specific rules or inject team context |
| Missing fields | AI skips fields when the schema is too large — split or prioritize |
| Invalid JSON | Add stronger instructions: "Respond ONLY with valid JSON. No markdown." |
| Wrong estimates | Calibrate the estimate definitions in the rules section |
| Shallow analysis | Add "Be specific" rules with examples of what good vs bad looks like |

## Adding Team Profiles

Team profiles go in `team-profiles/`. Use `example.json` as a starting point.

If sharing your profile publicly:
- Remove real API keys, tokens, and internal URLs
- Use generic service names if needed
- Keep the tech stack and conventions — that's the valuable part

## Development Setup

```bash
# Clone
git clone https://github.com/openmindednewby/ai-confluence-pipeline.git
cd ai-confluence-pipeline

# Start n8n for testing workflows
cp .env.example .env
# Edit .env with your keys
docker compose up -d
```

## Code Style

- JSON files: 2-space indent
- Markdown: ATX headers (`#`), one blank line between sections
- Prompt templates: use `{{placeholder}}` syntax for variables
- Commit messages: conventional commits (`feat:`, `fix:`, `docs:`, `chore:`)

## Questions?

Open an issue. There are no dumb questions — especially about template design.
