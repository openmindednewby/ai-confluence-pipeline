// Phase 2 step 4: interpolation + assertions.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  interpolateString, interpolateValue, interpolateHeaders,
} from '../dist/core/trace/acceptance/interpolate.js';
import { checkExpect, jsonPath } from '../dist/core/trace/acceptance/assert.js';

// ── interpolation ───────────────────────────────────────────────────────────────────────────

test('interpolateString: vars + env + missing→empty', () => {
  const out = interpolateString('Bearer {{tok}} {{env.SECRET}} {{nope}}', { tok: 'abc' }, { SECRET: 's3' });
  assert.equal(out, 'Bearer abc s3 ');
});

test('interpolateString: dotted path into captured object', () => {
  assert.equal(interpolateString('id={{user.id}}', { user: { id: 7 } }), 'id=7');
});

test('interpolateValue: whole-string {{x}} preserves type', () => {
  assert.equal(interpolateValue('{{n}}', { n: 42 }), 42);
  assert.deepEqual(interpolateValue('{{o}}', { o: { a: 1 } }), { a: 1 });
});

test('interpolateValue: deep into body object/array', () => {
  const body = interpolateValue({ token: '{{tok}}', list: ['{{n}}', 'x'] }, { tok: 't', n: 5 });
  assert.deepEqual(body, { token: 't', list: [5, 'x'] });
});

test('interpolateHeaders: string-coerces each value', () => {
  assert.deepEqual(interpolateHeaders({ Authorization: 'Bearer {{tok}}' }, { tok: 'z' }), { Authorization: 'Bearer z' });
});

// ── jsonPath ────────────────────────────────────────────────────────────────────────────────

test('jsonPath: dotted, indexed, quoted, root', () => {
  const obj = { a: { b: [{ id: 9 }] }, 'odd.key': 1 };
  assert.equal(jsonPath(obj, '$.a.b[0].id'), 9);
  assert.equal(jsonPath(obj, '$["odd.key"]'), 1);
  assert.deepEqual(jsonPath(obj, '$'), obj);
  assert.equal(jsonPath(obj, '$.a.missing'), undefined);
});

// ── checkExpect ─────────────────────────────────────────────────────────────────────────────

test('checkExpect: status pass/fail', () => {
  assert.deepEqual(checkExpect({ status: 200 }, { status: 200, body: '' }), []);
  assert.equal(checkExpect({ status: 200 }, { status: 404, body: '' }).length, 1);
});

test('checkExpect: exit code', () => {
  assert.deepEqual(checkExpect({ exit: 0 }, { exit: 0, body: '' }), []);
  assert.equal(checkExpect({ exit: 0 }, { exit: 1, body: '' }).length, 1);
});

test('checkExpect: json exists / absent / equals', () => {
  const actual = { body: '', json: { token: 'abc', count: 3 } };
  assert.deepEqual(checkExpect({ json: { '$.token': 'exists' } }, actual), []);
  assert.deepEqual(checkExpect({ json: { '$.count': 3 } }, actual), []);
  assert.deepEqual(checkExpect({ json: { '$.missing': 'absent' } }, actual), []);
  assert.equal(checkExpect({ json: { '$.token': 'absent' } }, actual).length, 1);
  assert.equal(checkExpect({ json: { '$.count': 4 } }, actual).length, 1);
  assert.equal(checkExpect({ json: { '$.missing': 'exists' } }, actual).length, 1);
});

test('checkExpect: header equals (case-insensitive name)', () => {
  const actual = { body: '', headers: { 'content-type': 'application/json' } };
  assert.deepEqual(checkExpect({ headers: { 'Content-Type': 'application/json' } }, actual), []);
  assert.equal(checkExpect({ headers: { 'Content-Type': 'text/html' } }, actual).length, 1);
});

test('checkExpect: bodyContains all substrings', () => {
  assert.deepEqual(checkExpect({ bodyContains: ['ok', 'done'] }, { body: 'ok and done' }), []);
  assert.equal(checkExpect({ bodyContains: ['missing'] }, { body: 'ok' }).length, 1);
});

test('checkExpect: aggregates multiple failures', () => {
  const failures = checkExpect({ status: 200, bodyContains: ['x'] }, { status: 500, body: 'y' });
  assert.equal(failures.length, 2);
});
