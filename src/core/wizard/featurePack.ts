/**
 * The "feature pack" — the dev-ready package the wizard produces. `FeaturePack` is the pure data shape
 * (requirements, the system + per-use-case mermaid, ordered context-rich tasks, tests, ready-made curls,
 * doc links); `renderFeaturePack` turns it into ONE self-contained HTML page the developer just reads,
 * approves (the mermaid), and verifies (runs the curls). Approvals persist to localStorage; nothing here
 * touches the network except loading mermaid from a CDN to draw the diagrams.
 */

export interface FeatureRequirement {
  key: string;
  title: string;
  status?: string;
}
export interface FeatureUseCase {
  key: string;
  title: string;
  mermaid?: string;
}
export interface FeatureTask {
  id?: string; // .acp task id (e.g. TASK-4) if created
  key: string; // requirement key it implements
  title: string;
  status?: string;
  requirements: string[];
  context: string[]; // inline context lines for the executing agent (code refs, criteria, doc links)
}
export interface FeatureTest {
  tech: string; // unit | e2e | acceptance | …
  title: string;
  key: string;
}
export interface FeatureCurl {
  name: string;
  method: string;
  url: string;
  body?: unknown;
  note?: string; // e.g. "replace {id} with a real id that has data"
}
export interface FeaturePack {
  feature: string;
  source: string; // jira | confluence | both | none
  generatedAt?: string;
  requirements: FeatureRequirement[];
  systemMermaid?: string;
  useCases: FeatureUseCase[];
  gapAnalysis?: string;
  tasks: FeatureTask[];
  tests: FeatureTest[];
  curls: FeatureCurl[];
  docs: { mdDir: string; confluenceUrl?: string };
}

/** Render the same pack as a plain markdown doc (the record-of-truth + Confluence-publishable). */
export function renderFeaturePackMarkdown(pack: FeaturePack): string {
  const lines: string[] = [`# Feature: ${pack.feature}`, '', `_source: ${pack.source}${pack.generatedAt ? ` · generated ${pack.generatedAt}` : ''}_`, ''];
  lines.push('## Requirements', '');
  for (const r of pack.requirements) lines.push(`- \`${r.key}\` ${r.title}${r.status ? ` (${r.status})` : ''}`);
  if (!pack.requirements.length) lines.push('_none_');
  lines.push('', '## System data-flow', '');
  lines.push(pack.systemMermaid ? '```mermaid\n' + pack.systemMermaid.trim() + '\n```' : '_no diagram_');
  lines.push('', '## Use cases', '');
  for (const u of pack.useCases) {
    lines.push(`### ${u.key} — ${u.title}`, '');
    if (u.mermaid) lines.push('```mermaid\n' + u.mermaid.trim() + '\n```', '');
  }
  lines.push('## Tasks (ordered)', '');
  for (const t of pack.tasks) {
    lines.push(`- [ ] ${t.id ? `**${t.id}** ` : ''}${t.title}  · ${t.requirements.join(', ') || t.key}`);
    for (const c of t.context) lines.push(`  - ${c}`);
  }
  if (!pack.tasks.length) lines.push('_none_');
  lines.push('', '## Tests', '');
  for (const t of pack.tests) lines.push(`- ${t.tech}: ${t.title} \`@${t.key}\``);
  if (!pack.tests.length) lines.push('_none_');
  lines.push('', '## Verify — curls', '');
  for (const c of pack.curls) {
    lines.push(`- **${c.name}** — \`${c.method} ${c.url}\`${c.note ? ` (${c.note})` : ''}`);
  }
  if (!pack.curls.length) lines.push('_none yet_');
  if (pack.gapAnalysis) lines.push('', '## Gap analysis', '', pack.gapAnalysis.trim());
  return lines.join('\n') + '\n';
}

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function mermaidBlock(id: string, code: string | undefined): string {
  if (!code || !code.trim()) return '<p class="muted">No diagram generated.</p>';
  return `<pre class="mermaid" id="${id}">${esc(code.trim())}</pre>`;
}

function curlCommand(c: FeatureCurl, baseUrl: string): string {
  const url = /^https?:\/\//i.test(c.url) ? c.url : `${baseUrl}${c.url.startsWith('/') ? '' : '/'}${c.url}`;
  const parts = [`curl -i -X ${c.method} "${url}"`];
  if (c.body !== undefined) {
    parts.push(`  -H "Content-Type: application/json"`);
    parts.push(`  -d '${JSON.stringify(c.body)}'`);
  }
  return parts.join(' \\\n');
}

export interface RenderOptions {
  baseUrl?: string; // base url woven into the curl commands
  mermaidCdn?: string; // override the mermaid script URL
}

/** Render a `FeaturePack` into one self-contained HTML page. */
export function renderFeaturePack(pack: FeaturePack, opts: RenderOptions = {}): string {
  const baseUrl = opts.baseUrl ?? 'http://localhost:8080';
  const cdn = opts.mermaidCdn ?? 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js';

  const reqRows = pack.requirements.length
    ? pack.requirements.map((r) => `<li><code>${esc(r.key)}</code> ${esc(r.title)}${r.status ? ` <span class="pill">${esc(r.status)}</span>` : ''}</li>`).join('\n')
    : '<li class="muted">No requirements gathered.</li>';

  const useCaseBlocks = pack.useCases.length
    ? pack.useCases.map((u, i) => `<section class="card"><h3>${esc(u.key)} — ${esc(u.title)}</h3>${mermaidBlock(`uc-${i}`, u.mermaid)}</section>`).join('\n')
    : '<p class="muted">No per-use-case diagrams yet.</p>';

  const taskBlocks = pack.tasks.length
    ? pack.tasks.map((t, i) => {
        const ctx = t.context.length ? `<ul class="ctx">${t.context.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : '';
        const idLabel = t.id ? `${esc(t.id)} · ` : '';
        return `<li class="task"><label><input type="checkbox" data-key="task-${i}"> <b>${idLabel}${esc(t.title)}</b></label> <span class="pill">${esc(t.requirements.join(', ') || t.key)}</span>${ctx}</li>`;
      }).join('\n')
    : '<li class="muted">No tasks generated.</li>';

  const testRows = pack.tests.length
    ? pack.tests.map((t) => `<li><span class="pill">${esc(t.tech)}</span> ${esc(t.title)} <code>@${esc(t.key)}</code></li>`).join('\n')
    : '<li class="muted">No tests generated.</li>';

  const curlBlocks = pack.curls.length
    ? pack.curls.map((c, i) => `<section class="card"><label><input type="checkbox" data-key="curl-${i}"> <b>${esc(c.name)}</b></label>${c.note ? `<p class="note">${esc(c.note)}</p>` : ''}<pre class="curl"><code>${esc(curlCommand(c, baseUrl))}</code></pre><button class="copy" data-copy="curl-code-${i}">Copy</button><script type="text/plain" id="curl-code-${i}">${esc(curlCommand(c, baseUrl))}</script></section>`).join('\n')
    : '<p class="muted">No ready-made curls yet (added in a later wizard phase).</p>';

  const confluenceLink = pack.docs.confluenceUrl ? `<a href="${esc(pack.docs.confluenceUrl)}">Confluence page</a> · ` : '';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Feature pack — ${esc(pack.feature)}</title>
<style>
  :root{--bg:#0f1115;--card:#191c23;--ink:#e7e9ee;--muted:#9aa3b2;--accent:#5b8def;--ok:#3fb950;--line:#2a2f3a}
  *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 system-ui,Segoe UI,Roboto,sans-serif}
  .wrap{max-width:980px;margin:0 auto;padding:28px 20px 80px}
  h1{font-size:24px;margin:.2em 0} h2{margin-top:1.6em;border-bottom:1px solid var(--line);padding-bottom:.3em}
  h3{margin:.2em 0 .6em} .muted{color:var(--muted)} .note{color:var(--muted);margin:.3em 0}
  .meta{color:var(--muted);font-size:13px} code{background:#0c0e12;padding:.1em .35em;border-radius:4px}
  .pill{display:inline-block;background:#222733;color:#cdd5e3;border:1px solid var(--line);border-radius:999px;padding:.05em .6em;font-size:12px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin:12px 0}
  ul{padding-left:18px} li{margin:.25em 0} .ctx{margin:.4em 0 .2em;color:var(--muted);font-size:13px}
  .task{list-style:none;border-bottom:1px dashed var(--line);padding:.5em 0}
  pre.mermaid{background:#0c0e12;border:1px solid var(--line);border-radius:8px;padding:12px;overflow:auto}
  pre.curl{background:#0c0e12;border:1px solid var(--line);border-radius:8px;padding:12px;overflow:auto;white-space:pre}
  button.copy{background:var(--accent);color:#fff;border:0;border-radius:6px;padding:.35em .8em;cursor:pointer;margin-top:6px}
  .steps{display:flex;flex-wrap:wrap;gap:8px;margin:.6em 0} .steps span{background:var(--card);border:1px solid var(--line);border-radius:999px;padding:.2em .7em;font-size:13px}
  a{color:var(--accent)}
</style></head>
<body><div class="wrap">
  <h1>Feature pack — ${esc(pack.feature)}</h1>
  <p class="meta">source: <b>${esc(pack.source)}</b>${pack.generatedAt ? ` · generated ${esc(pack.generatedAt)}` : ''} · ${confluenceLink}<a href="${esc(pack.docs.mdDir)}">markdown</a></p>
  <div class="steps"><span>1 · read the data-flow</span><span>2 · approve the tasks</span><span>3 · run the curls</span><span>4 · verify</span></div>

  <h2>Requirements</h2><ul>${reqRows}</ul>

  <h2>System data-flow</h2><section class="card">${mermaidBlock('system', pack.systemMermaid)}</section>

  <h2>Use cases</h2>${useCaseBlocks}

  <h2>Tasks <span class="meta">(tick to approve)</span></h2><ul>${taskBlocks}</ul>

  <h2>Tests</h2><ul>${testRows}</ul>

  <h2>Verify — ready-made curls <span class="meta">(tick when it returns data)</span></h2>${curlBlocks}

  ${pack.gapAnalysis ? `<h2>Gap analysis</h2><section class="card"><pre style="white-space:pre-wrap">${esc(pack.gapAnalysis)}</pre></section>` : ''}
</div>
<script src="${esc(cdn)}"></script>
<script>
  try { mermaid.initialize({ startOnLoad: true, theme: 'dark' }); } catch (e) {}
  // persist approve/verify ticks
  var KEY = 'katastasi-featurepack:' + ${JSON.stringify(pack.feature)};
  function load(){ try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch(e){ return {}; } }
  var state = load();
  document.querySelectorAll('input[type=checkbox][data-key]').forEach(function(cb){
    var k = cb.getAttribute('data-key'); if (state[k]) cb.checked = true;
    cb.addEventListener('change', function(){ state[k] = cb.checked; localStorage.setItem(KEY, JSON.stringify(state)); });
  });
  document.querySelectorAll('button.copy').forEach(function(b){
    b.addEventListener('click', function(){
      var src = document.getElementById(b.getAttribute('data-copy'));
      if (src) navigator.clipboard.writeText(src.textContent).then(function(){ b.textContent='Copied'; setTimeout(function(){ b.textContent='Copy'; }, 1200); });
    });
  });
</script>
</body></html>
`;
}
