/**
 * Deep discovery for the web wizard's Source step. Given a pasted Jira/Confluence URL, walk outward —
 * an epic's child issues, a page's child pages, AND any Jira keys / Confluence page links found in the
 * descriptions/bodies — into a flat, de-duplicated list the dev then confirms (tick/untick) before
 * pulling. Bounded by depth + item count so it can't run away. The `DiscoverClient` is the provider seam
 * (a real Atlassian one in atlassianClient.ts; a fake in tests) — so this engine is pure + network-free.
 */
export interface DiscoverItem {
  type: 'jira' | 'confluence';
  id: string; // Jira key or Confluence page id
  title: string;
  url?: string;
  via: 'pasted' | 'child' | 'linked';
  parent?: string;
}

export interface DiscoverClient {
  jiraIssue(key: string): Promise<{ key: string; title: string; body: string; url?: string }>;
  jiraChildren(key: string): Promise<Array<{ key: string; title: string; url?: string }>>;
  confluencePage(id: string): Promise<{ id: string; title: string; body: string; url?: string }>;
  confluenceChildren(id: string): Promise<Array<{ id: string; title: string; url?: string }>>;
}

export type SourceRef =
  | { kind: 'jira-issue'; id: string }
  | { kind: 'confluence-page'; id: string }
  | { kind: 'unknown'; id: string };

const JIRA_KEY = /[A-Z][A-Z0-9]+-\d+/;

/** Classify a pasted URL (or bare key/id) into a seed reference. */
export function parseSourceUrl(input: string): SourceRef {
  const s = input.trim();
  const page = /\/pages\/(\d+)/.exec(s);
  if (page) return { kind: 'confluence-page', id: page[1] };
  const browse = /\/browse\/([A-Z][A-Z0-9]+-\d+)/.exec(s);
  if (browse) return { kind: 'jira-issue', id: browse[1] };
  if (new RegExp(`^${JIRA_KEY.source}$`).test(s)) return { kind: 'jira-issue', id: s };
  if (/^\d+$/.test(s)) return { kind: 'confluence-page', id: s };
  return { kind: 'unknown', id: s };
}

/** Extract referenced Jira keys + Confluence page ids from a free-text body (markdown). */
export function extractRefs(text: string): { jiraKeys: string[]; pageIds: string[] } {
  const jiraKeys = [...new Set(text.match(new RegExp(JIRA_KEY.source, 'g')) ?? [])];
  const pageIds = [...new Set([...text.matchAll(/\/pages\/(\d+)/g)].map((m) => m[1]))];
  return { jiraKeys, pageIds };
}

interface QueueRef {
  type: 'jira' | 'confluence';
  id: string;
  via: DiscoverItem['via'];
  parent?: string;
  depth: number;
}

export interface DiscoverOptions {
  maxItems?: number; // hard cap (default 200)
  maxDepth?: number; // how far to follow children/links (default 3)
}

/** Walk from a pasted URL into all related issues/pages. Skips anything it can't fetch (kept robust). */
export async function discover(input: string, client: DiscoverClient, opts: DiscoverOptions = {}): Promise<DiscoverItem[]> {
  const maxItems = opts.maxItems ?? 200;
  const maxDepth = opts.maxDepth ?? 3;
  const seed = parseSourceUrl(input);
  if (seed.kind === 'unknown') throw new Error(`Could not recognise "${input}" as a Jira issue or Confluence page URL.`);

  const queue: QueueRef[] = [{ type: seed.kind === 'jira-issue' ? 'jira' : 'confluence', id: seed.id, via: 'pasted', depth: 0 }];
  const seen = new Set<string>();
  const out: DiscoverItem[] = [];

  while (queue.length && out.length < maxItems) {
    const ref = queue.shift()!;
    const k = `${ref.type}:${ref.id}`;
    if (seen.has(k)) continue;
    seen.add(k);

    try {
      if (ref.type === 'jira') {
        const issue = await client.jiraIssue(ref.id);
        out.push({ type: 'jira', id: issue.key, title: issue.title, url: issue.url, via: ref.via, parent: ref.parent });
        if (ref.depth >= maxDepth) continue;
        for (const c of await client.jiraChildren(ref.id)) queue.push({ type: 'jira', id: c.key, via: 'child', parent: ref.id, depth: ref.depth + 1 });
        const refs = extractRefs(issue.body);
        for (const key of refs.jiraKeys) if (key !== ref.id) queue.push({ type: 'jira', id: key, via: 'linked', parent: ref.id, depth: ref.depth + 1 });
        for (const pid of refs.pageIds) queue.push({ type: 'confluence', id: pid, via: 'linked', parent: ref.id, depth: ref.depth + 1 });
      } else {
        const page = await client.confluencePage(ref.id);
        out.push({ type: 'confluence', id: page.id, title: page.title, url: page.url, via: ref.via, parent: ref.parent });
        if (ref.depth >= maxDepth) continue;
        for (const c of await client.confluenceChildren(ref.id)) queue.push({ type: 'confluence', id: c.id, via: 'child', parent: ref.id, depth: ref.depth + 1 });
        const refs = extractRefs(page.body);
        for (const key of refs.jiraKeys) queue.push({ type: 'jira', id: key, via: 'linked', parent: ref.id, depth: ref.depth + 1 });
        for (const pid of refs.pageIds) if (pid !== ref.id) queue.push({ type: 'confluence', id: pid, via: 'linked', parent: ref.id, depth: ref.depth + 1 });
      }
    } catch {
      // a broken link / permission gap shouldn't abort the whole discovery
    }
  }
  return out;
}
