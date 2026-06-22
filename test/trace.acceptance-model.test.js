// Phase 2 step 1: acceptance model + JSON spec parser — normalisation of HTTP + process steps.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeStep, normalizeSpec, isHttpMethod, AcceptanceParseError,
} from '../dist/core/trace/acceptance/model.js';
import { parseJsonSpec } from '../dist/core/trace/acceptance/parse/json.js';

test('isHttpMethod is case-insensitive', () => {
  assert.equal(isHttpMethod('post'), true);
  assert.equal(isHttpMethod('GET'), true);
  assert.equal(isHttpMethod('run'), false);
});

test('normalizeStep: HTTP step from a method key', () => {
  const s = normalizeStep({ POST: '/login', body: { user: 'a' }, expect: { status: 401 } }, 'x');
  assert.equal(s.kind, 'http');
  assert.equal(s.method, 'POST');
  assert.equal(s.url, '/login');
  assert.deepEqual(s.body, { user: 'a' });
  assert.equal(s.expect.status, 401);
});

test('normalizeStep: lowercase method key is upper-cased', () => {
  const s = normalizeStep({ get: '/me', expect: { status: 200 } }, 'x');
  assert.equal(s.method, 'GET');
});

test('normalizeStep: capture + headers carried through', () => {
  const s = normalizeStep(
    { POST: '/login', expect: { status: 200 }, capture: { tok: '$.token' }, headers: { 'X-A': '1' } },
    'x',
  );
  assert.deepEqual(s.capture, { tok: '$.token' });
  assert.deepEqual(s.headers, { 'X-A': '1' });
});

test('normalizeStep: process step from "run"', () => {
  const s = normalizeStep({ run: 'node cli.js --help', expect: { exit: 0, stdoutContains: 'Usage' } }, 'x');
  assert.equal(s.kind, 'process');
  assert.equal(s.run, 'node cli.js --help');
  assert.equal(s.expect.exit, 0);
  assert.deepEqual(s.expect.bodyContains, ['Usage']); // stdoutContains aliases bodyContains
});

test('normalizeStep: neither method nor run → error', () => {
  assert.throws(() => normalizeStep({ expect: { status: 200 } }, 'x'), AcceptanceParseError);
});

test('normalizeSpec: full {req, cases} shape', () => {
  const spec = normalizeSpec(
    { req: 'PROJ-1', cases: [{ name: 'bad creds', steps: [{ POST: '/login', expect: { status: 401 } }] }] },
    'spec.json',
  );
  assert.equal(spec.req, 'PROJ-1');
  assert.equal(spec.source, 'spec.json');
  assert.equal(spec.cases.length, 1);
  assert.equal(spec.cases[0].name, 'bad creds');
});

test('normalizeSpec: single-case shorthand {req, steps}', () => {
  const spec = normalizeSpec({ req: 'PROJ-2', name: 'smoke', steps: [{ GET: '/health', expect: { status: 200 } }] }, 's');
  assert.equal(spec.cases.length, 1);
  assert.equal(spec.cases[0].name, 'smoke');
});

test('normalizeSpec: fallback req when none in body', () => {
  const spec = normalizeSpec({ steps: [{ GET: '/', expect: { status: 200 } }] }, 's', 'FALL-9');
  assert.equal(spec.req, 'FALL-9');
});

test('normalizeSpec: missing req with no fallback → error', () => {
  assert.throws(() => normalizeSpec({ steps: [] }, 's'), AcceptanceParseError);
});

test('normalizeSpec: case with no steps → error', () => {
  assert.throws(
    () => normalizeSpec({ req: 'P-1', cases: [{ name: 'empty', steps: [] }] }, 's'),
    AcceptanceParseError,
  );
});

test('parseJsonSpec: single object', () => {
  const specs = parseJsonSpec(JSON.stringify({ req: 'P-1', steps: [{ GET: '/a', expect: { status: 200 } }] }), 'f.json');
  assert.equal(specs.length, 1);
  assert.equal(specs[0].req, 'P-1');
});

test('parseJsonSpec: array of specs gets indexed sources', () => {
  const specs = parseJsonSpec(
    JSON.stringify([
      { req: 'P-1', steps: [{ GET: '/a', expect: { status: 200 } }] },
      { req: 'P-2', steps: [{ GET: '/b', expect: { status: 200 } }] },
    ]),
    'f.json',
  );
  assert.equal(specs.length, 2);
  assert.equal(specs[1].source, 'f.json[1]');
});

test('parseJsonSpec: invalid JSON → error', () => {
  assert.throws(() => parseJsonSpec('{not json', 'f.json'), AcceptanceParseError);
});
