/**
 * Thin direct-REST client for Atlassian Cloud (Jira + Confluence), Basic-auth from `.env`.
 *
 * Used by the reverse `pull` flow (Jira/Confluence → markdown). Read-only: GET issues, search
 * child issues, GET pages, list child pages. No AI, no n8n.
 */
import { basicAuthHeader, getConfluenceCreds, getJiraCreds, type AtlassianCreds } from './config.js';

const DEFAULT_TIMEOUT_MS = 30_000;
const SEARCH_PAGE_SIZE = 100;

export class AtlassianError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: string,
  ) {
    super(message);
    this.name = 'AtlassianError';
  }
}

/** A Jira issue as returned by the REST API (only the fields we read). */
export interface JiraIssue {
  key: string;
  fields: {
    summary?: string;
    description?: unknown; // ADF doc
    labels?: string[];
    priority?: { name?: string } | null;
    issuetype?: { name?: string } | null;
    status?: { name?: string } | null;
    components?: Array<{ name?: string }>;
    parent?: { key?: string } | null;
    subtasks?: Array<{ key?: string }>;
    assignee?: { displayName?: string; emailAddress?: string; accountId?: string } | null;
    [key: string]: unknown;
  };
}

/** A Confluence page as returned by the REST API (only the fields we read). */
export interface ConfluencePage {
  id: string;
  title?: string;
  body?: { storage?: { value?: string } };
  space?: { key?: string };
  _links?: { webui?: string; base?: string };
}

const JIRA_FIELDS = 'summary,description,labels,priority,issuetype,status,components,parent,subtasks,assignee';

/** Strip surrounding angle/quote noise and pull the issue key out of a key or browse URL. */
export function parseIssueRef(ref: string): string {
  const trimmed = ref.trim();
  const fromUrl = /\/browse\/([A-Z][A-Z0-9_]+-\d+)/i.exec(trimmed);
  if (fromUrl) return fromUrl[1].toUpperCase();
  const bare = /^[A-Z][A-Z0-9_]+-\d+$/i.exec(trimmed);
  if (bare) return trimmed.toUpperCase();
  throw new Error(`Could not parse a Jira issue key from "${ref}". Expected e.g. PROJ-12 or a /browse/PROJ-12 URL.`);
}

/** Pull the numeric page id out of a page id or a Confluence page URL. */
export function parsePageRef(ref: string): string {
  const trimmed = ref.trim();
  const fromPages = /\/pages\/(\d+)/.exec(trimmed);
  if (fromPages) return fromPages[1];
  const fromQuery = /[?&]pageId=(\d+)/.exec(trimmed);
  if (fromQuery) return fromQuery[1];
  if (/^\d+$/.test(trimmed)) return trimmed;
  throw new Error(`Could not parse a Confluence page id from "${ref}". Expected a numeric id or a /pages/<id> URL.`);
}

/** GET a single Jira issue with the fields we convert. */
export async function getIssue(key: string, creds = getJiraCreds()): Promise<JiraIssue> {
  return getJson<JiraIssue>(creds, `/rest/api/3/issue/${encodeURIComponent(key)}?fields=${JIRA_FIELDS}`);
}

/** Return the direct child issues of `parentKey` (stories under an epic, or sub-tasks under a story). */
export async function getChildIssues(parentKey: string, creds = getJiraCreds()): Promise<JiraIssue[]> {
  const jql = `parent = ${parentKey} ORDER BY created ASC`;
  const issues: JiraIssue[] = [];
  let startAt = 0;
  for (;;) {
    const path =
      `/rest/api/3/search?jql=${encodeURIComponent(jql)}` +
      `&fields=${JIRA_FIELDS}&startAt=${startAt}&maxResults=${SEARCH_PAGE_SIZE}`;
    const page = await getJson<{ issues?: JiraIssue[]; total?: number }>(creds, path);
    const batch = page.issues ?? [];
    issues.push(...batch);
    startAt += batch.length;
    if (batch.length < SEARCH_PAGE_SIZE || startAt >= (page.total ?? startAt)) break;
  }
  return issues;
}

/** GET a single Confluence page with its storage body. */
export async function getPage(id: string, creds = getConfluenceCreds()): Promise<ConfluencePage> {
  return getJson<ConfluencePage>(
    creds,
    `/wiki/rest/api/content/${encodeURIComponent(id)}?expand=body.storage,version,space`,
  );
}

/** Return the direct child pages of a Confluence page, each with its storage body. */
export async function getChildPages(id: string, creds = getConfluenceCreds()): Promise<ConfluencePage[]> {
  const pages: ConfluencePage[] = [];
  let start = 0;
  for (;;) {
    const path =
      `/wiki/rest/api/content/${encodeURIComponent(id)}/child/page` +
      `?expand=body.storage,space&limit=${SEARCH_PAGE_SIZE}&start=${start}`;
    const page = await getJson<{ results?: ConfluencePage[]; size?: number }>(creds, path);
    const batch = page.results ?? [];
    pages.push(...batch);
    start += batch.length;
    if (batch.length < SEARCH_PAGE_SIZE) break;
  }
  return pages;
}

/** Build the full webui URL for a Confluence page from its `_links`, falling back to the id. */
export function pageWebUrl(page: ConfluencePage, creds: AtlassianCreds): string {
  const webui = page._links?.webui;
  if (webui) return `${creds.baseUrl}/wiki${webui}`;
  return `${creds.baseUrl}/wiki/pages/viewpage.action?pageId=${page.id}`;
}

/** Shared GET helper: Basic auth, JSON accept, timeout, structured errors. */
async function getJson<T>(creds: AtlassianCreds, path: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const url = `${creds.baseUrl}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: basicAuthHeader(creds), Accept: 'application/json' },
      signal: controller.signal,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new AtlassianError(`Failed to reach Atlassian at ${url}: ${reason}`);
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  if (!res.ok) {
    throw new AtlassianError(`Atlassian GET ${path} returned ${res.status}`, res.status, text);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AtlassianError(`Atlassian GET ${path} returned non-JSON`, res.status, text);
  }
}
