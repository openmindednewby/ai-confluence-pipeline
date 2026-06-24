# First-time setup — connecting Jira & Confluence

Katastasi talks to Jira and Confluence with your own **Atlassian API token** (never your password) over
their REST APIs. This is a one-time, ~3-minute setup. If you only use local markdown, **skip this** — the
wizard's `none` source needs nothing.

> The wizard checks this for you: `katastasi wizard check` tells you exactly what's missing and prints
> these steps. Nothing is sent anywhere except your own Atlassian site.

## 1. Create an Atlassian API token (once, covers both Jira & Confluence)

1. Sign in to Atlassian, then open **https://id.atlassian.com/manage-profile/security/api-tokens**.
2. **Create API token** → give it a label like `katastasi` → **Copy** it (you only see it once).
3. That single token works for **both** Jira and Confluence on the same Atlassian Cloud site.

You also need:
- Your **site base URL** — e.g. `https://your-company.atlassian.net` (Jira) and usually
  `https://your-company.atlassian.net/wiki` (Confluence).
- The **email** you log in with.

## 2. Put them in a local `.env` (never committed)

Copy `.env.example` to `.env` in the repo root and fill in:

```ini
# --- Jira ---
JIRA_BASE_URL=https://your-company.atlassian.net
JIRA_EMAIL=you@your-company.com
JIRA_API_TOKEN=paste-the-token-here

# --- Confluence (same token; note the /wiki on the base URL) ---
CONFLUENCE_BASE_URL=https://your-company.atlassian.net/wiki
CONFLUENCE_EMAIL=you@your-company.com
CONFLUENCE_API_TOKEN=paste-the-same-token-here
```

`.env` is git-ignored. The token is used only to build a standard `Authorization: Basic` header
(`email:token`, base64) against your site — exactly how the Atlassian REST API expects.

> **Security:** treat the token like a password. To revoke it, delete it on the API-tokens page above.
> Tokens can be scoped/expired there. Never paste it into chat, a commit, or a URL.

## 3. Verify the connection

```bash
katastasi wizard check                 # checks both, prints any missing key + how to fix
# or exercise a real pull:
katastasi pull-jira PROJ-1 ./tmp-jira          # pull an epic you can see
katastasi pull-confluence 123456 ./tmp-conf    # pull a page id you can see
```

If a pull returns the issue/page, you're connected. A `401/403` means the token/email/base-URL don't
match or you lack permission on that item.

## 4. What needs which permission

| Action | Needs |
|---|---|
| Pull requirements from a **Jira epic** | read access to that project/epic |
| Pull a **Confluence page** tree | read access to that space/page |
| **Publish** a tech-analysis page to Confluence | create/update access in the target space |
| **Create Jira tasks** from the analysis | create-issue access + `JIRA_PROJECT_KEY` set in `.env` |

## 5. Finding the ids the wizard asks for

- **Jira epic key** — the `PROJ-123` in the issue URL `…/browse/PROJ-123`.
- **Confluence page id** — the number in the page URL `…/pages/123456/Title`.
- **Target Confluence space / parent page** — set when publishing (the wizard prompts, or pass `--page-id`).

Once `.env` is set, every Katastasi command that touches Jira/Confluence (the wizard, `pull-*`,
`analyze --publish-*`, `trace --publish-confluence`) just works.
