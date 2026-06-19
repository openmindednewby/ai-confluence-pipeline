/**
 * Built-in web portal: `acp trace serve`. A dependency-free Node HTTP server that shows the live RTM
 * dashboard with a **Run** button + run history + regression banner, and exposes a small JSON/HTTP API
 * so n8n, CI, or an agent can trigger a run too. Re-uses the same engine + renderers as the CLI.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { isAbsolute, resolve } from 'node:path';
import type { TraceConfig } from './config.js';
import { loadTraceConfig } from './config.js';
import { listRuns } from './history.js';
import { runTrace } from './index.js';
import { publishConfluenceReport, updateRoadmapSection, writeOutputs } from './publish.js';
import { renderHtml } from './report/html.js';
import type { TraceReport } from './types.js';

export interface ServeOptions {
  port?: number;
  /** Bind host (default 127.0.0.1 — local only). */
  host?: string;
}

/** Start the portal. Resolves with the listening server (kept alive until stopped). */
export async function serve(configPath: string, baseDir: string, opts: ServeOptions = {}): Promise<Server> {
  const config = loadTraceConfig(configPath);
  const port = opts.port ?? config.portal?.port ?? 8787;
  const host = opts.host ?? '127.0.0.1';

  // The report currently shown; recomputed on each triggered run.
  let current: TraceReport = await runTrace(config, baseDir, { save: false, compare: true });

  const server = createServer((req, res) => {
    handle(req, res, config, baseDir, current, (r) => {
      current = r;
    }).catch((err) => sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) }));
  });

  await new Promise<void>((ok) => server.listen(port, host, ok));
  process.stdout.write(`\n  RTM portal: http://${host}:${port}\n  POST /run (?run=1 to execute suites, ?publish=1 to push to Confluence)  ·  GET /api/report  ·  Ctrl+C to stop\n`);
  return server;
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  config: TraceConfig,
  baseDir: string,
  current: TraceReport,
  setCurrent: (r: TraceReport) => void,
): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const route = `${req.method} ${url.pathname}`;

  if (route === 'GET /' || route === 'GET /index.html') {
    return sendHtml(res, portalPage(current, runsFor(config, baseDir)));
  }
  if (route === 'GET /api/report') return sendJson(res, 200, current);
  if (route === 'GET /api/runs') return sendJson(res, 200, { runs: runsFor(config, baseDir) });
  if (route === 'POST /run') {
    const report = await runTrace(config, baseDir, { run: url.searchParams.get('run') === '1', save: true, compare: true });
    applySinks(report, config, baseDir, url.searchParams.get('publish') === '1');
    setCurrent(report);
    return sendJson(res, 200, { ok: true, stats: report.stats, regressions: report.regressions ?? [] });
  }
  sendJson(res, 404, { error: `no route: ${route}` });
}

/** Write file outputs + roadmap section (+ Confluence when asked) after a triggered run. */
function applySinks(report: TraceReport, config: TraceConfig, baseDir: string, publish: boolean): void {
  if (config.output) writeOutputs(report, config.output, baseDir);
  if (config.publish?.roadmap) updateRoadmapSection(report, config.publish.roadmap, baseDir);
  if (publish && config.publish?.confluence) {
    void publishConfluenceReport(report, config.publish.confluence).catch(() => undefined);
  }
}

function runsFor(config: TraceConfig, baseDir: string): string[] {
  if (!config.history) return [];
  const dir = isAbsolute(config.history.dir) ? config.history.dir : resolve(baseDir, config.history.dir);
  return listRuns(dir)
    .map((p) => p.split(/[\\/]/).pop() as string)
    .reverse()
    .slice(0, 20);
}

const PORTAL_STYLE = `
.portal{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:14px}
.run-btn{background:#1a7f37;color:#fff;border:0;border-radius:8px;padding:8px 16px;font-size:14px;font-weight:600;cursor:pointer}
.run-btn:disabled{opacity:.6;cursor:default}
.run-opt{font-size:13px;color:#57606a}.portal-links a{font-size:13px;color:#0969da}
.runs{font-size:13px}.runs ul{margin:6px 0 0;padding-left:18px;max-height:160px;overflow:auto}
.runs code{font-family:ui-monospace,Menlo,Consolas,monospace}`;

const PORTAL_SCRIPT = `
const btn=document.getElementById('rtm-run'),chk=document.getElementById('rtm-suites');
btn&&btn.addEventListener('click',async()=>{btn.disabled=true;const t=btn.textContent;btn.textContent='Running…';
  try{await fetch('/run'+(chk&&chk.checked?'?run=1':''),{method:'POST'});location.reload();}
  catch(e){btn.textContent='Run failed — retry';btn.disabled=false;}});`;

/** Inject the portal toolbar + script into the static dashboard HTML. */
export function portalPage(report: TraceReport, runs: string[]): string {
  const runsList = runs.length
    ? runs.map((r) => `<li><code>${r.replace(/</g, '&lt;')}</code></li>`).join('')
    : '<li>(no history yet — click Run)</li>';
  const toolbar =
    '<div class="portal">' +
    '<button id="rtm-run" class="run-btn">▶ Run</button>' +
    '<label class="run-opt"><input type="checkbox" id="rtm-suites"> execute test suites</label>' +
    '<span class="portal-links"><a href="/api/report" target="_blank">JSON</a></span>' +
    `<details class="runs"><summary>History (${runs.length})</summary><ul>${runsList}</ul></details>` +
    '</div>';
  return renderHtml(report)
    .replace('</head>', `<style>${PORTAL_STYLE}</style></head>`)
    .replace('<div class="cards">', `${toolbar}<div class="cards">`)
    .replace('</body>', `<script>${PORTAL_SCRIPT}</script></body>`);
}

function sendHtml(res: ServerResponse, html: string): void {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}
