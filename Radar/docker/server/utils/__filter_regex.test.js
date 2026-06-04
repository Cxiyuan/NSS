// Filter regex helpers (extract module) — ReDoS defense unit tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { patternToRegex, escapeRegex } from './filter-regex.js';

// ─── escapeRegex: direct unit tests ─────────────────────────────────────
test('escapeRegex escapes all meta chars', () => {
  assert.equal(escapeRegex('a.b'), 'a\\.b');
  assert.equal(escapeRegex('a*b'), 'a\\*b');
  assert.equal(escapeRegex('a+b'), 'a\\+b');
  assert.equal(escapeRegex('a?b'), 'a\\?b');
  assert.equal(escapeRegex('a^b'), 'a\\^b');
  assert.equal(escapeRegex('a$b'), 'a\\$b');
  assert.equal(escapeRegex('a{b}'), 'a\\{b\\}');
  assert.equal(escapeRegex('a(b)'), 'a\\(b\\)');
  assert.equal(escapeRegex('a|b'), 'a\\|b');
  assert.equal(escapeRegex('a[b]'), 'a\\[b\\]');
  assert.equal(escapeRegex('a/b'), 'a\\/b');
  assert.equal(escapeRegex('a\\b'), 'a\\\\b');
});

test('escapeRegex leaves regular alphanumerics untouched', () => {
  assert.equal(escapeRegex('abc123'), 'abc123');
  assert.equal(escapeRegex('foo-bar'), 'foo-bar');
  assert.equal(escapeRegex('foo_bar'), 'foo_bar');
});

// ─── patternToRegex: ReDoS attack patterns return near-instantly ────────
test('patternToRegex: ReDoS `(a+)+b` completes in <200ms (1000 iters)', () => {
  const regex = patternToRegex('(a+)+b');
  const start = Date.now();
  for (let i = 0; i < 1000; i++) {
    regex.test('a'.repeat(50) + '!b');
  }
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 200, `1000 iterations took ${elapsed}ms, want <200ms`);
  // Literal match
  assert.equal(regex.test('(a+)+b'), true);
});

test('patternToRegex: alternation `(a|b+)+c` does not backtrack', () => {
  const regex = patternToRegex('(a|b+)+c');
  const start = Date.now();
  for (let i = 0; i < 1000; i++) {
    regex.test('ababababababababababababababababababababababababab');
  }
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 200, `1000 iterations took ${elapsed}ms`);
});

test('patternToRegex: char class `foo[abc]bar` is literal', () => {
  const regex = patternToRegex('foo[abc]bar');
  assert.equal(regex.test('foo[abc]bar'), true);
  assert.equal(regex.test('fooabar'), false);
});

test('patternToRegex: pipe `foo|bar` is literal (not alternation)', () => {
  const regex = patternToRegex('foo|bar');
  assert.equal(regex.test('foo|bar'), true);
  assert.equal(regex.test('foo'), false);
  assert.equal(regex.test('bar'), false);
});

// ─── patternToRegex: existing semantics (regression) ───────────────────
test('patternToRegex: exact match (no wildcard)', () => {
  const regex = patternToRegex('qq.com');
  assert.equal(regex.source, '^qq\\.com$');
  assert.equal(regex.test('qq.com'), true);
  assert.equal(regex.test('www.qq.com'), false);
});

test('patternToRegex: *. wildcard allows bare + subdomains', () => {
  const regex = patternToRegex('*.example.com');
  assert.equal(regex.source, '(?:^.+\\.)?example\\.com$');
  assert.equal(regex.test('example.com'), true);
  assert.equal(regex.test('sub.example.com'), true);
  assert.equal(regex.test('deep.sub.example.com'), true);
  // Different TLDs are excluded (the regex's `.+\.` requires a `.` separator)
  assert.equal(regex.test('example.org'), false);
  assert.equal(regex.test('notexample.org'), false);
});

test('patternToRegex: *suffix wildcard', () => {
  const regex = patternToRegex('*example.com');
  assert.equal(regex.source, 'example\\.com$');
  assert.equal(regex.test('example.com'), true);
  assert.equal(regex.test('sub.example.com'), true);
  assert.equal(regex.test('example.org'), false);
});

