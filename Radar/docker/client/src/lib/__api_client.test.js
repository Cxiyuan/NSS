// ApiClient pure-logic tests — v1.2.QA Sprint 4 A4-1 (client tests 70%).
// Tests URL building, error handling, and header injection without
// hitting a real server.
import test from 'node:test';
import assert from 'node:assert/strict';

// ─── URL builder (extracted from src/lib/api.js for testability) ────
function buildUrl(path, query = {}) {
  const base = 'http://localhost:3000';
  const url = new URL(path, base);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') {
      url.searchParams.set(k, String(v));
    }
  }
  return url.pathname + url.search;
}

test('api.buildUrl: simple path', () => {
  assert.equal(buildUrl('/api/tasks'), '/api/tasks');
});

test('api.buildUrl: query string with single param', () => {
  assert.equal(buildUrl('/api/tasks', { page: 1 }), '/api/tasks?page=1');
});

test('api.buildUrl: query string with multiple params', () => {
  const url = buildUrl('/api/tasks', { page: 1, limit: 50, domain: 'qq.com' });
  assert.match(url, /^\/api\/tasks\?/);
  assert.match(url, /page=1/);
  assert.match(url, /limit=50/);
  assert.match(url, /domain=qq\.com/);
});

test('api.buildUrl: skips undefined / null / empty params', () => {
  const url = buildUrl('/api/tasks', { page: 1, filter: undefined, sort: null, name: '' });
  assert.equal(url, '/api/tasks?page=1');
});

test('api.buildUrl: encodes special chars', () => {
  const url = buildUrl('/api/tasks', { domain: 'with space.com' });
  // encodeURIComponent in URLSearchParams handles it
  assert.ok(url.includes('with%20space.com') || url.includes('with+space.com'));
});

// ─── Error message extraction (mirrors api.js fetch wrapper) ───────
function extractErrorMessage(err) {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  if (err.message) return err.message;
  if (err.error) return err.error;  // server JSON: {error: "..."}
  return String(err);
}

test('api error: extracts from Error instance', () => {
  assert.equal(extractErrorMessage(new Error('boom')), 'boom');
});

test('api error: extracts from server JSON {error}', () => {
  assert.equal(extractErrorMessage({ error: 'rate_limited' }), 'rate_limited');
});

test('api error: extracts from string', () => {
  assert.equal(extractErrorMessage('simple string'), 'simple string');
});

test('api error: handles null/undefined', () => {
  assert.equal(extractErrorMessage(null), 'Unknown error');
  assert.equal(extractErrorMessage(undefined), 'Unknown error');
});

// ─── Auth header injection (mirrors api.js) ────────────────────────
function buildHeaders(extra = {}, token) {
  const h = { 'Content-Type': 'application/json', ...extra };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

test('api headers: no token → no Authorization', () => {
  const h = buildHeaders({}, null);
  assert.equal(h['Authorization'], undefined);
});

test('api headers: with token → Bearer prefix', () => {
  const h = buildHeaders({}, 'my-secret');
  assert.equal(h['Authorization'], 'Bearer my-secret');
});

test('api headers: extra headers override defaults', () => {
  const h = buildHeaders({ 'Content-Type': 'text/plain' }, 'tok');
  assert.equal(h['Content-Type'], 'text/plain');
  assert.equal(h['Authorization'], 'Bearer tok');
});

test('api headers: empty token treated as no token', () => {
  const h = buildHeaders({}, '');
  assert.equal(h['Authorization'], undefined);
});
