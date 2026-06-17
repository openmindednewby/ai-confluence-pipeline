// Unit tests for the reverse-pipeline converters and helpers.
// Run against compiled dist (see package.json `test` script).
import test from 'node:test';
import assert from 'node:assert/strict';
import { adfToMarkdown } from '../dist/core/adfToMarkdown.js';
import { storageToMarkdown } from '../dist/core/storageToMarkdown.js';
import { parseIssueRef, parsePageRef } from '../dist/core/atlassian.js';
import { slugify, issueToMarkdown, pageToMarkdown } from '../dist/core/pull.js';

test('adfToMarkdown: paragraph with marks and link', () => {
  const doc = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Hello ' },
          { type: 'text', text: 'bold', marks: [{ type: 'strong' }] },
          { type: 'text', text: ' and ' },
          { type: 'text', text: 'link', marks: [{ type: 'link', attrs: { href: 'https://x.io' } }] },
        ],
      },
    ],
  };
  assert.equal(adfToMarkdown(doc), 'Hello **bold** and [link](https://x.io)');
});

test('adfToMarkdown: heading + bullet list', () => {
  const doc = {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Acceptance Criteria' }] },
      {
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }] },
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'two' }] }] },
        ],
      },
    ],
  };
  assert.equal(adfToMarkdown(doc), '### Acceptance Criteria\n\n- one\n- two');
});

test('adfToMarkdown: code block keeps language and body', () => {
  const doc = {
    type: 'doc',
    content: [{ type: 'codeBlock', attrs: { language: 'ts' }, content: [{ type: 'text', text: 'const a = 1;' }] }],
  };
  assert.equal(adfToMarkdown(doc), '```ts\nconst a = 1;\n```');
});

test('adfToMarkdown: table', () => {
  const cell = (t) => ({ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] });
  const doc = {
    type: 'doc',
    content: [
      {
        type: 'table',
        content: [
          { type: 'tableRow', content: [cell('A'), cell('B')] },
          { type: 'tableRow', content: [cell('1'), cell('2')] },
        ],
      },
    ],
  };
  assert.equal(adfToMarkdown(doc), '| A | B |\n| --- | --- |\n| 1 | 2 |');
});

test('adfToMarkdown: null/empty returns empty string', () => {
  assert.equal(adfToMarkdown(null), '');
  assert.equal(adfToMarkdown(undefined), '');
});

test('storageToMarkdown: headings, bold, link', () => {
  const html = '<h2>Title</h2><p>Some <strong>bold</strong> and <a href="https://x.io">link</a>.</p>';
  assert.equal(storageToMarkdown(html), '## Title\n\nSome **bold** and [link](https://x.io).');
});

test('storageToMarkdown: bullet list', () => {
  const html = '<ul><li>one</li><li>two</li></ul>';
  assert.equal(storageToMarkdown(html), '- one\n- two');
});

test('storageToMarkdown: code macro', () => {
  const html =
    '<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">js</ac:parameter>' +
    '<ac:plain-text-body><![CDATA[const a = 1;]]></ac:plain-text-body></ac:structured-macro>';
  assert.equal(storageToMarkdown(html), '```js\nconst a = 1;\n```');
});

test('storageToMarkdown: table', () => {
  const html = '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>';
  assert.equal(storageToMarkdown(html), '| A | B |\n| --- | --- |\n| 1 | 2 |');
});

test('storageToMarkdown: task list', () => {
  const html =
    '<ac:task-list><ac:task><ac:task-status>complete</ac:task-status><ac:task-body>done</ac:task-body></ac:task>' +
    '<ac:task><ac:task-status>incomplete</ac:task-status><ac:task-body>todo</ac:task-body></ac:task></ac:task-list>';
  assert.equal(storageToMarkdown(html), '- [x] done\n- [ ] todo');
});

test('storageToMarkdown: strips the pipeline footer', () => {
  const html =
    '<p>Body</p><hr/><p><em>Published from markdown by <a href="https://github.com/x">ai-confluence-pipeline</a> on 2026-01-01</em></p>';
  assert.equal(storageToMarkdown(html), 'Body');
});

test('storageToMarkdown: decodes entities', () => {
  assert.equal(storageToMarkdown('<p>a &amp; b &lt;c&gt;</p>'), 'a & b <c>');
});

test('parseIssueRef: key and browse url', () => {
  assert.equal(parseIssueRef('PROJ-12'), 'PROJ-12');
  assert.equal(parseIssueRef('proj-12'), 'PROJ-12');
  assert.equal(parseIssueRef('https://x.atlassian.net/browse/ABC-345'), 'ABC-345');
  assert.throws(() => parseIssueRef('not a key'));
});

test('parsePageRef: id, /pages/ url, pageId query', () => {
  assert.equal(parsePageRef('123456'), '123456');
  assert.equal(parsePageRef('https://x.atlassian.net/wiki/spaces/T/pages/98765/Title'), '98765');
  assert.equal(parsePageRef('https://x.atlassian.net/pages/viewpage.action?pageId=555'), '555');
  assert.throws(() => parsePageRef('nope'));
});

test('slugify: kebab, trimmed, capped, fallback', () => {
  assert.equal(slugify('Hello, World!'), 'hello-world');
  assert.equal(slugify('  --Already-Kebab--  '), 'already-kebab');
  assert.equal(slugify('!!!'), 'untitled');
  assert.ok(slugify('x'.repeat(80)).length <= 50);
});

test('issueToMarkdown: forward-format round-trip shape', () => {
  const issue = {
    key: 'PROJ-1',
    fields: {
      summary: 'Build the API',
      description: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Do the thing.' }] }] },
      priority: { name: 'High' },
      components: [{ name: 'backend' }],
      labels: ['auth', 'n8n-pipeline-generated'],
    },
  };
  const md = issueToMarkdown(issue);
  assert.equal(
    md,
    '# Build the API\n\nDo the thing.\n\n## Priority\nHigh\n\n## Component\nbackend\n\n## Labels\nauth\n',
  );
});

test('pageToMarkdown: title heading + body', () => {
  const page = { id: '1', title: 'Docs', body: { storage: { value: '<p>Hello</p>' } } };
  assert.equal(pageToMarkdown(page), '# Docs\n\nHello\n');
});
