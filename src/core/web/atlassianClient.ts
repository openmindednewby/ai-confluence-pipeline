/**
 * Real `DiscoverClient` over the existing Atlassian REST client. Credentials come from the local `.env`
 * (read server-side only). Descriptions/bodies are converted to markdown so the link extractor can find
 * referenced Jira keys + Confluence pages. Built per-request from the dev's saved creds.
 */
import { adfToMarkdown, type AdfNode } from '../adfToMarkdown.js';
import { storageToMarkdown } from '../storageToMarkdown.js';
import { getChildIssues, getChildPages, getIssue, getPage, pageWebUrl } from '../atlassian.js';
import type { AtlassianCreds } from '../config.js';
import { CRED_GROUPS, readEnvValues } from './envFile.js';
import type { DiscoverClient } from './discover.js';

function credsFor(env: Record<string, string>, group: 'jira' | 'confluence'): AtlassianCreds | null {
  const [base, email, token] = CRED_GROUPS[group];
  if (!env[base] || !env[email] || !env[token]) return null;
  return { baseUrl: env[base].replace(/\/+$/, ''), email: env[email], apiToken: env[token] };
}

/** Build a discovery client from the saved `.env`. Throws a friendly error if a needed source isn't connected. */
export function atlassianDiscoverClient(baseDir: string): DiscoverClient {
  const env = readEnvValues(baseDir);
  const jira = credsFor(env, 'jira');
  const confluence = credsFor(env, 'confluence');
  const needJira = (): AtlassianCreds => {
    if (!jira) throw new Error('Jira is not connected — add your Jira credentials in the Connect step.');
    return jira;
  };
  const needConfluence = (): AtlassianCreds => {
    if (!confluence) throw new Error('Confluence is not connected — add your Confluence credentials in the Connect step.');
    return confluence;
  };

  return {
    async jiraIssue(key) {
      const creds = needJira();
      const issue = await getIssue(key, creds);
      return {
        key: issue.key,
        title: (issue.fields.summary ?? key).trim(),
        body: issue.fields.description ? adfToMarkdown(issue.fields.description as AdfNode) : '',
        url: `${creds.baseUrl}/browse/${issue.key}`,
      };
    },
    async jiraChildren(key) {
      const creds = needJira();
      return (await getChildIssues(key, creds)).map((i) => ({ key: i.key, title: (i.fields.summary ?? i.key).trim(), url: `${creds.baseUrl}/browse/${i.key}` }));
    },
    async confluencePage(id) {
      const creds = needConfluence();
      const page = await getPage(id, creds);
      return { id: page.id, title: (page.title ?? id).trim(), body: storageToMarkdown(page.body?.storage?.value), url: pageWebUrl(page, creds) };
    },
    async confluenceChildren(id) {
      const creds = needConfluence();
      return (await getChildPages(id, creds)).map((p) => ({ id: p.id, title: (p.title ?? p.id).trim(), url: pageWebUrl(p, creds) }));
    },
  };
}
