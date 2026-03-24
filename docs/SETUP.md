# Setup Guide

## Prerequisites

- Docker & Docker Compose
- Confluence Cloud (with API token)
- Jira Cloud (with API token) — optional
- Anthropic API key (or OpenAI)

> **n8n licensing:** n8n is free for self-hosted use (fair-code / Sustainable Use License). No user, workflow, or execution limits. You only need a paid license if you resell it or offer it as a hosted service. For details or fully open-source alternatives, see the [FAQ in README](../README.md#faq).

## 1. Get Your API Tokens

### AI Provider (choose one)

**Option A — GitHub Models API (FREE, recommended):**
1. Go to https://github.com/settings/tokens?type=beta
2. Click "Generate new token"
3. Name it `ai-confluence-pipeline`
4. Under **Permissions** → **Account permissions** → set **Models** to **Read**
5. Click "Generate token" and copy it

**Option B — Anthropic API (pay-per-use):**
1. Go to https://console.anthropic.com/
2. Create an API key

### Confluence & Jira API Token
1. Go to https://id.atlassian.com/manage-profile/security/api-tokens
2. Click "Create API token"
3. Copy the token — this works for both Confluence and Jira

### Find Your Confluence Space Key

The **space key** is the short identifier for the Confluence space where pages will be created (e.g., `TECH`, `ENG`, `PLATFORM`). It appears in every Confluence URL for that space.

**How to find it:**

1. **From the URL (quickest):** Open any page in your Confluence space. The URL looks like:
   ```
   https://yourcompany.atlassian.net/wiki/spaces/TECH/pages/12345/Page+Title
                                                  ^^^^
                                                  This is the space key
   ```

2. **From Space Settings:**
   - Open your Confluence space
   - In the left sidebar, click the **space name** or the **⋯** (more actions) button next to it
   - Click **Space settings** → **Space details**
   - The **Space key** is shown on this page

3. **From the Confluence homepage:**
   - Go to your Confluence home (`https://yourcompany.atlassian.net/wiki`)
   - Click **Spaces** in the top navigation
   - Each space shows its key in the list

4. **Via API** (if you have many spaces):
   ```bash
   curl -s -u your-email@company.com:your-api-token \
     https://yourcompany.atlassian.net/wiki/rest/api/space \
     | jq '.results[] | {key, name}'
   ```

> **Don't have a space yet?** Create one: Confluence home → **Spaces** → **Create space**. Choose a short, memorable key like `TECH` or `ENG`. You can't change it after creation.

## 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your values:

**AI Provider (choose one):**
- `GITHUB_TOKEN` — your GitHub PAT (if using free GitHub Models)
- `ANTHROPIC_API_KEY` — your Claude API key (if using Anthropic)
- `AI_MODEL` — model to use (e.g., `openai/gpt-4o` for GitHub Models, `claude-sonnet-4-6` for Anthropic)

**Confluence:**
- `CONFLUENCE_BASE_URL` — e.g., `https://yourcompany.atlassian.net`
- `CONFLUENCE_EMAIL` — your Atlassian email
- `CONFLUENCE_API_TOKEN` — from step 1
- `CONFLUENCE_SPACE_KEY` — the space key you found above (e.g., `TECH`)

**Jira (optional):**
- `JIRA_*` — same base URL and credentials as Confluence if using the same Atlassian instance
- `JIRA_PROJECT_KEY` — the Jira project key (visible in ticket IDs like `PROJ-123`)

## 3. Start n8n

```bash
docker compose up -d
```

Open http://localhost:10353 and log in with the credentials from `.env`.

## 4. Import the Workflow

1. In n8n, go to **Workflows** → **Import from file**
2. Select the workflow for your AI provider:
   - **GitHub Models (free):** `workflows/github-models-pipeline.json`
   - **Anthropic API:** `workflows/technical-analysis-pipeline.json`
3. Configure credentials in n8n:
   - Go to **Settings** → **Credentials** → **Add Credential**
   - Create **"Confluence Basic Auth"** (type: HTTP Basic Auth):
     - User: your Atlassian email
     - Password: your Confluence API token (from step 1)
   - Create **"Jira Basic Auth"** (type: HTTP Basic Auth):
     - User: your Atlassian email
     - Password: your Jira API token (same token works if same Atlassian instance)
   - Open the workflow and assign these credentials to the "Create Confluence Page" and "Create Jira Issue" nodes
4. Activate the workflow (toggle in top-right)

## 5. Test It

```bash
# Bash
./scripts/trigger-analysis.sh "Add user notification preferences with email and push channels"

# PowerShell
.\scripts\trigger-analysis.ps1 -Description "Add user notification preferences with email and push channels"
```

## 6. Set Up Team Profile (Optional)

```bash
cp team-profiles/example.json team-profiles/my-team.json
```

Edit `my-team.json` with your tech stack, conventions, Jira project key, and Confluence space. This context gets injected into prompts for more specific output. See [team-profiles/example.json](../team-profiles/example.json) for what each field does.

## 7. Customize

- **Prompts**: Edit `prompts/` to match your team's conventions (used by the current n8n workflow)
- **Templates**: Browse `templates/` for 13 scenario-specific prompt templates (new-feature, bug-fix, ADR, etc.) — see [CUSTOMIZATION.md](CUSTOMIZATION.md) for details
- **Confluence**: Modify the "Format for Confluence" node to match your page templates
- **Jira**: Add labels, components, or custom fields to the "Create Jira Issue" node

## Troubleshooting

### "401 Unauthorized" from Confluence/Jira
- Verify your email and API token in the n8n credentials
- Make sure you're using the email associated with your Atlassian account

### AI response parsing fails
- Check the "Parse AI Response" node execution data in n8n
- The AI sometimes wraps JSON in markdown fences — the parser handles this, but edge cases exist
- Try switching to `claude-opus-4-6` for more reliable structured output

### Confluence page formatting looks wrong
- Confluence uses its own "storage format" (XHTML-like)
- Check the "Format for Confluence" node — you may need to adjust HTML tags
- Use `<ac:structured-macro>` for code blocks, panels, etc.
