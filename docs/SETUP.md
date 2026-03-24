# Setup Guide

## Prerequisites

- **Docker Desktop** — required to run n8n
  - **Windows:** Download from https://docs.docker.com/desktop/setup/install/windows-install/ → run the installer → restart your PC if prompted
  - **Mac:** Download from https://docs.docker.com/desktop/setup/install/mac-install/ (Intel or Apple Silicon)
  - **Linux:** Follow https://docs.docker.com/desktop/setup/install/linux/
  - After install, open Docker Desktop and make sure it says **"Docker Desktop is running"** in the bottom-left
- Confluence Cloud (with API token)
- Jira Cloud (with API token) — optional

> **n8n licensing:** n8n is free for self-hosted use (fair-code / Sustainable Use License). No user, workflow, or execution limits. You only need a paid license if you resell it or offer it as a hosted service. For details or fully open-source alternatives, see the [FAQ in README](../README.md#faq).

## 1. Get Your API Tokens

### AI Provider (choose one)

**Option A — GitHub Models API (FREE, recommended):**

You need a GitHub Personal Access Token (PAT). There are two types — either works:

**Classic token (recommended — simplest, no special scopes needed):**

Classic tokens work with GitHub Models **without checking any scopes at all**.

1. Go to https://github.com/settings/tokens (or: Profile picture → **Settings** → scroll sidebar to bottom → **Developer settings** → **Personal access tokens** → **Tokens (classic)**)
2. Click **"Generate new token"** → **"Generate new token (classic)"**
3. In the **"Note"** field, enter `ai-confluence-pipeline`
4. Set **Expiration** (90 days recommended, or "No expiration" for personal use)
5. **Leave all scopes unchecked** — classic tokens access GitHub Models without any special permissions
6. Click **"Generate token"** (green button at bottom)
7. **Copy the token immediately** — you won't be able to see it again. It starts with `ghp_`

> **Direct link:** https://github.com/settings/tokens

**Fine-grained token (alternative — stricter security):**

Fine-grained tokens require an explicit Models permission:

1. Go to https://github.com/settings/tokens?type=beta (or: **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens**)
2. Click **"Generate new token"**
3. Enter a **Token name**: `ai-confluence-pipeline`
4. Set **Expiration** (90 days recommended)
5. Under **Permissions** → **Account permissions** → find **"Models"** → set to **"Read"**
   - If you don't see "Models" in the list, your account may not have this option yet — use a classic token instead
6. Click **"Generate token"**
7. **Copy the token immediately** — it starts with `github_pat_`

> **Can't find Developer Settings?** Go to https://github.com/settings/profile → scroll the left sidebar all the way to the **bottom** → last item is **"Developer settings"**. Or go directly: https://github.com/settings/apps

**Option B — Anthropic API (pay-per-use):**
1. Go to https://console.anthropic.com/
2. Sign up or log in
3. Go to **API Keys** → **Create Key**
4. Copy the key — it starts with `sk-ant-`

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

Make sure Docker Desktop is running, then:

```bash
docker compose up -d
```

This downloads the [official n8n Docker image](https://hub.docker.com/r/n8nio/n8n) (~400 MB on first run) and starts it in the background. You'll see:

```
[+] Running 1/1
 ✔ Container ai-confluence-pipeline-n8n-1  Started
```

> **First time?** The initial download takes 1-3 minutes depending on your internet. Subsequent starts are instant.
>
> **n8n Docker image:** https://hub.docker.com/r/n8nio/n8n — this is the official image pulled automatically by `docker compose up`. You don't need to download it manually.
>
> **Troubleshooting:** If you get `docker: command not found`, Docker Desktop isn't installed or isn't running. If you get a port conflict, change `N8N_PORT` in `.env`.

Open http://localhost:10353 and log in with the credentials from `.env` (`N8N_BASIC_AUTH_USER` / `N8N_BASIC_AUTH_PASSWORD`).

## 4. Choose and Import a Workflow

There are 3 workflows available. Pick the one that fits how you want to work:

### Pipeline A: Preview First (Recommended for getting started)

```
You describe a feature → AI generates analysis → Saved as local markdown files
    → You review and edit → You push to Confluence when ready
```

**File:** `workflows/preview-pipeline.json`

**How it works:**
1. You run `./scripts/trigger-preview.sh "Add user notifications"`
2. AI generates a technical analysis
3. Two files are saved in the `preview/` folder:
   - `.md` file — human-readable markdown you can review and edit in any editor
   - `.json` file — raw data used by the push script
4. When you're happy with it, run `./scripts/push-to-confluence.sh preview/xxx.json`
5. Optionally add `--jira` to also create Jira tickets

**Best for:** First-time setup, when you want to verify AI output before publishing, when you want to edit the analysis before it goes to Confluence.

**AI provider:** GitHub Models API (free). Uses your `GITHUB_TOKEN` from `.env`.

**Credentials needed in n8n:** None — this workflow only calls the AI and returns results. Confluence/Jira is handled by the push script.

---

### Pipeline B: Direct Push with GitHub Models (Free)

```
You describe a feature → AI generates analysis → Confluence page created → Jira tickets created
```

**File:** `workflows/github-models-pipeline.json`

**How it works:**
1. You run `./scripts/trigger-analysis.sh "Add user notifications"`
2. AI generates the analysis
3. A Confluence page is created automatically
4. Jira tickets are created for each task (unless you pass `--no-jira`)
5. You get back the Confluence URL and Jira ticket keys

**Best for:** When you trust the AI output and want everything created in one step. Fast workflow once you've validated the quality with Pipeline A a few times.

**AI provider:** GitHub Models API (free). Uses your `GITHUB_TOKEN` from `.env`.

**Credentials needed in n8n:** Confluence Basic Auth + Jira Basic Auth (see step 5 below).

---

### Pipeline C: Direct Push with Anthropic API (Paid, highest quality)

```
Same as Pipeline B, but uses Claude directly via Anthropic API
```

**File:** `workflows/technical-analysis-pipeline.json`

**How it works:** Same as Pipeline B — one-step generation + Confluence + Jira.

**Best for:** When you want the best possible AI output quality and are willing to pay per use (~$0.50-2 per analysis).

**AI provider:** Anthropic API (paid). Uses your `ANTHROPIC_API_KEY` from `.env`.

**Credentials needed in n8n:** Confluence Basic Auth + Jira Basic Auth (see step 5 below).

---

### Which one should I pick?

| Situation | Use |
|-----------|-----|
| Just getting started, want to try it out | **Pipeline A** (Preview) |
| Validated the output, want to automate | **Pipeline B** (GitHub Models) |
| Need best quality, have API budget | **Pipeline C** (Anthropic) |
| Want to review before publishing | **Pipeline A** (Preview) |
| High volume (50+ analyses/day) | **Pipeline C** (Anthropic — no rate limits) |

> **You can import multiple workflows** into n8n and use them side by side. Each has a different webhook URL (`/webhook/preview` vs `/webhook/analyze`).

### Import

1. In n8n, go to **Workflows** → **Import from file**
2. Select the workflow JSON file for the pipeline you chose
3. If you want multiple pipelines, repeat for each one

## 5. Set Up Credentials in n8n

Credentials are created **from inside the workflow nodes**, not from a separate settings page.

### Confluence credential:

1. Open your imported workflow
2. Double-click the **"Create Confluence Page"** node
3. In the node settings, find **Authentication** → it should say **"Generic Credential Type"** with **"HTTP Basic Auth"**
4. Next to **Credential for HTTP Basic Auth**, click the dropdown → **"Create New Credential"**
5. Fill in:
   - **User:** your Atlassian email (e.g., `you@company.com`)
   - **Password:** your Confluence **API token** (from step 1 — this is NOT your Atlassian login password)
6. Click **Save** — name it something like "Confluence Basic Auth"

### Jira credential (skip if not using Jira):

7. Double-click the **"Create Jira Issue"** node
8. Next to **Credential for HTTP Basic Auth**, click the dropdown → **"Create New Credential"**
9. Fill in:
   - **User:** your Atlassian email (same as above)
   - **Password:** your Jira **API token** (same token works if same Atlassian instance)
10. Click **Save**

> **Reusing credentials:** After creating a credential once, it appears in the dropdown of any HTTP Request node. You can select an existing credential instead of creating a new one.

### Save the workflow

11. Click **Save** in the top-right of the workflow editor

## 6. Publish the Workflow

Click the **"Publish"** button in the top-right corner of the workflow editor. This activates the webhook so it can receive requests.

> **"Publish" doesn't make anything public.** n8n is running on your machine — the webhook is only reachable at `localhost:10353`. Nobody outside your computer can access it. The button just means "turn this workflow on."

## 7. Run It

There are 3 ways to trigger the pipeline. Pick whichever feels most comfortable:

### Option 1: Browser Form (easiest)

Open `trigger.html` in your browser (just double-click the file). It's a simple form where you:
1. Select the pipeline (Preview, Direct Push, or Direct Push without Jira)
2. Type your feature description
3. Optionally add context about your tech stack
4. Click **"Generate Analysis"**
5. Results appear on the same page — markdown preview or Confluence/Jira links

No terminal needed. Works in any browser. Press **Ctrl+Enter** to submit quickly.

> **Note:** n8n must be running (`docker compose up -d`) for the form to work. If you see "Cannot reach n8n", start it first.

### Option 2: CLI Scripts (for terminal users)

```bash
# Preview (save markdown locally, push later)
./scripts/trigger-preview.sh "Add user notification preferences"

# Direct push to Confluence + Jira
./scripts/trigger-analysis.sh "Add user notification preferences"

# Direct push to Confluence only (no Jira)
./scripts/trigger-analysis.sh "Add user notification preferences" --no-jira

# Push a previewed analysis to Confluence
./scripts/push-to-confluence.sh preview/20260324-143022-user-notifications.json
./scripts/push-to-confluence.sh preview/20260324-143022-user-notifications.json --jira
```

```powershell
# PowerShell equivalents
.\scripts\trigger-preview.ps1 -Description "Add user notification preferences"
.\scripts\trigger-analysis.ps1 -Description "Add user notification preferences"
.\scripts\push-to-confluence.ps1 -File preview\20260324-143022-user-notifications.json -CreateJira
```

### Option 3: From n8n UI (test mode)

1. Open the workflow in n8n (http://localhost:10353)
2. Click **"Test Workflow"** (play button at bottom of the editor)
3. n8n will wait for a webhook request — send one using the browser form or a script
4. You can see each node's input/output by clicking on it — useful for debugging

## 8. Set Up Team Profile (Optional)

```bash
cp team-profiles/example.json team-profiles/my-team.json
```

Edit `my-team.json` with your tech stack, conventions, Jira project key, and Confluence space. This context gets injected into prompts for more specific output. See [team-profiles/example.json](../team-profiles/example.json) for what each field does.

## 9. Customize

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
