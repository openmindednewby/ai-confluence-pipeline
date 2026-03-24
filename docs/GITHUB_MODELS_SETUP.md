# GitHub Models API Setup (Free — No API Key Needed)

The GitHub Models API gives you free access to GPT-4o, Claude, Llama, and other models using just your GitHub account. No paid API key required.

## How It Works

GitHub hosts AI models and exposes them via an OpenAI-compatible REST API at `https://models.github.ai`. You authenticate with a GitHub Personal Access Token (PAT) — the same kind you use for `git push`.

## Rate Limits (Free Tier)

| Model Tier | Requests/min | Requests/day | Tokens/request |
|------------|-------------|-------------|----------------|
| High (GPT-4o, Claude) | 10 | 50 | 8,000 |
| Low (GPT-4o-mini, Llama) | 15 | 150 | 8,000 |
| Embedding | 15 | 150 | 8,000 |

For this pipeline (1 analysis = 1 API call), 50 requests/day is more than enough for most tech leads.

> **Copilot subscribers** get higher rate limits. **Pay-as-you-go** is also available if you need more.

## Available Models

Models accessible via GitHub Models API include:

| Model | ID for API | Quality |
|-------|-----------|---------|
| GPT-5 | `openai/gpt-5` | Best OpenAI |
| GPT-4.1 | `openai/gpt-4.1` | Great, coding + long context |
| GPT-4o | `gpt-4o` | Good general purpose |
| GPT-4o mini | `gpt-4o-mini` | Good, higher rate limits |
| Claude Opus 4 | `anthropic/claude-4-opus` | Best Claude |
| Claude Sonnet 4 | `anthropic/claude-4-sonnet` | Great, faster |
| Llama 4 Scout | `meta/llama-4-scout` | Good, open-source |
| DeepSeek R1 | `deepseek/deepseek-r1` | Good, reasoning |

> **Note:** Model IDs are inconsistent — some have a vendor prefix (`openai/gpt-5`), some don't (`gpt-4o`). Always check the [GitHub Models marketplace](https://github.com/marketplace?type=models) for exact IDs.

> Check the full catalog: `GET https://models.github.ai/catalog/models`

## Setup Steps

### 1. Create a GitHub Personal Access Token

You need a PAT (Personal Access Token) to authenticate with the GitHub Models API. There are two types — either works.

#### Option A: Classic Token (recommended — simplest)

Classic tokens work with GitHub Models **without any special scopes**. You don't need to check any boxes.

1. Go to https://github.com/settings/tokens
   - Or: Profile picture (top-right) → **Settings** → scroll left sidebar to the very bottom → **Developer settings** → **Personal access tokens** → **Tokens (classic)**
2. Click **"Generate new token"** → **"Generate new token (classic)"**
3. Fill in:
   - **Note:** `ai-confluence-pipeline`
   - **Expiration:** 90 days (or "No expiration" for personal use)
4. **Leave all scopes unchecked** — classic tokens access GitHub Models automatically, no special permissions needed
5. Click **"Generate token"** (green button at bottom)
6. **Copy the token immediately** — GitHub will never show it again
   - It looks like: `ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

#### Option B: Fine-Grained Token (stricter security)

Fine-grained tokens DO need an explicit permission:

1. Go to https://github.com/settings/tokens?type=beta
   - Or: **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens**
2. Click **"Generate new token"**
3. Fill in:
   - **Token name:** `ai-confluence-pipeline`
   - **Expiration:** 90 days
4. Under **Permissions** → **Account permissions** → find **"Models"** → set to **"Read"**
   - If you don't see "Models" in the list, your account may not have this option yet — use a classic token instead
5. Click **"Generate token"**
6. **Copy the token immediately**
   - It looks like: `github_pat_xxxxxxxxxxxxxxxxxxxxxxxxxxxx`

#### Can't find Developer Settings?

Go to https://github.com/settings/profile → scroll the left sidebar all the way to the **bottom** → the last item is **"Developer settings"**. Or go directly to: https://github.com/settings/apps

### 2. Configure .env

```bash
cp .env.example .env
```

Edit `.env`:
```env
# AI Provider
AI_PROVIDER=github-models
GITHUB_TOKEN=github_pat_xxxxx        # Your PAT from step 1
AI_MODEL=openai/gpt-4.1               # Or openai/gpt-5, gpt-4o, anthropic/claude-4-sonnet

# Leave ANTHROPIC_API_KEY and OPENAI_API_KEY empty
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
```

### 3. Update the n8n Workflow

The default workflow calls the Anthropic API. To use GitHub Models instead, update the **"Call Claude API"** node:

**URL:** Change to:
```
https://models.github.ai/inference/chat/completions
```

**Headers:** Replace the Anthropic headers with:
```
Authorization: Bearer {{ $env.GITHUB_TOKEN }}
Content-Type: application/json
Accept: application/vnd.github+json
X-GitHub-Api-Version: 2026-03-10
```

**Body:** Change from Anthropic format to OpenAI-compatible format:
```json
{
  "model": "{{ $env.AI_MODEL }}",
  "messages": [
    {
      "role": "user",
      "content": "Your prompt here..."
    }
  ],
  "max_tokens": 4096
}
```

**Parse response:** Update the "Parse AI Response" node. The GitHub Models response uses OpenAI format:
```javascript
// GitHub Models / OpenAI format
const response = $input.first().json;
const content = response.choices[0].message.content;
// (rest of parsing logic stays the same)
```

### 4. Alternative: Import the GitHub Models Workflow

Instead of modifying the default workflow, import the pre-configured variant:

```
workflows/github-models-pipeline.json
```

This workflow is identical to the default but pre-configured for GitHub Models API.

## Comparison: GitHub Models vs Paid API Keys

| | GitHub Models (Free) | Anthropic API | OpenAI API |
|---|---|---|---|
| **Cost** | Free | ~$3-15 per million tokens | ~$2.50-10 per million tokens |
| **Rate limit** | 50 req/day (high tier) | Unlimited (with billing) | Unlimited (with billing) |
| **Setup** | GitHub PAT only | API key + billing | API key + billing |
| **Models** | GPT-4o, Claude, Llama, etc. | Claude only | GPT only |
| **Best for** | Low volume (<50 analyses/day) | High volume, best Claude models | High volume, best GPT models |
| **Response time** | Slightly slower | Fast | Fast |

## Troubleshooting

### "403 Forbidden" or "401 Unauthorized"
- Verify your PAT has the `models:read` scope (or `read:models` for classic tokens)
- Make sure the PAT hasn't expired
- Check that the `Authorization: Bearer` header includes the full token

### "429 Too Many Requests"
- You've hit the rate limit. Wait until the next reset window (usually resets per-minute and per-day)
- Switch to a lower-tier model (e.g., `openai/gpt-4o-mini`) for higher limits
- Consider upgrading to pay-as-you-go if you need more

### Response format differs from expected
- GitHub Models uses OpenAI-compatible response format (`choices[0].message.content`), not Anthropic format (`content[0].text`)
- Make sure you updated the "Parse AI Response" node

## Sources

- [GitHub Models REST API — Inference](https://docs.github.com/en/rest/models/inference)
- [GitHub Models Billing & Rate Limits](https://docs.github.com/billing/managing-billing-for-your-products/about-billing-for-github-models)
- [GitHub Models Quickstart](https://docs.github.com/en/github-models/quickstart)
- [Prototyping with AI Models](https://docs.github.com/github-models/prototyping-with-ai-models)
