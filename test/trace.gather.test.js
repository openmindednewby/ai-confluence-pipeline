// Unified requirements collector: gather a mix of sources into one local folder + manifest.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeRequirementsFolder, requirementMarkdown, readRequirementsManifest } from '../dist/core/trace/requirements/folder.js';
import { gatherRequirements } from '../dist/core/trace/index.js';
import { parseTraceConfig } from '../dist/core/trace/config.js';

const req = (key, title, source = 'markdown', complete = false) => ({ key, title, declaredStatus: complete ? 'Done' : 'To Do', declaredComplete: complete, source });

test('requirementMarkdown: frontmatter + key tag hint', () => {
  const md = requirementMarkdown(req('PROJ-1', 'Login', 'jira-epic', true));
  assert.match(md, /^---\nkey: PROJ-1/);
  assert.match(md, /source: jira-epic/);
  assert.match(md, /# PROJ-1 — Login/);
  assert.match(md, /Tag tests with @PROJ-1/);
});

test('writeRequirementsFolder: one file per req + manifest, dedup, no-clobber', () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'rtm-gather-')), 'requirements');
  const out = writeRequirementsFolder([req('PROJ-1', 'A'), req('GH-9', 'B', 'command'), req('proj-1', 'dup')], dir);
  assert.equal(out.files.length, 2); // PROJ-1 deduped (first wins)
  assert.ok(existsSync(join(dir, 'PROJ-1.md')) && existsSync(join(dir, 'GH-9.md')));
  const manifest = readRequirementsManifest(dir);
  assert.deepEqual(manifest.map((r) => r.key).sort(), ['GH-9', 'PROJ-1']);
  assert.equal(manifest[0].file, 'PROJ-1.md');
  // no clobber without force
  assert.throws(() => writeRequirementsFolder([req('X', 'x')], dir), /already has requirement files/);
  assert.doesNotThrow(() => writeRequirementsFolder([req('X', 'x')], dir, true)); // force ok
});

test('gatherRequirements: collects from a MIX of sources', async () => {
  const root = mkdtempSync(join(tmpdir(), 'rtm-gather2-'));
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeFileSync(join(root, 'docs', 'requirements.md'), '- [x] PROJ-1 Login\n- [ ] PROJ-2 Logout');
  writeFileSync(join(root, 'extra.js'), `console.log(JSON.stringify([{key:'GH-9',title:'CSV',status:'open'}]))`);
  const config = parseTraceConfig(JSON.stringify({
    scopes: [{ requirements: [{ type: 'markdown', path: 'docs/requirements.md' }, { type: 'command', command: 'node extra.js' }], tests: [] }],
  }));
  const reqs = await gatherRequirements(config, root);
  assert.deepEqual(reqs.map((r) => r.key).sort(), ['GH-9', 'PROJ-1', 'PROJ-2']);
  assert.equal(reqs.find((r) => r.key === 'GH-9').source, 'command');
});
