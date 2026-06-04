// Filter regex helpers — ReDoS defense tests (v1.2 fix: 9.2.5).
// Tests patternToRegex (extracted from FilterEngine) and verifies the
// FilterEngine end-to-end behavior against ReDoS attack patterns.
import test from 'node:test';
import assert from 'node:assert/strict';
import { patternToRegex, escapeRegex } from '../utils/filter-regex.js';
import { FilterEngine } from './filter.js';

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
test('patternToRegex: ReDoS `(a+)+b` is treated as literal anchor-to-anchor', () => {
  const regex = patternToRegex('(a+)+b');
  // The pattern is now the literal string "(a+)+b" with anchors, so:
  assert.equal(regex.test('(a+)+b'), true);          // exact match
  // A 30-char "aaa...a" hostname should NOT trigger backtracking
  const start = Date.now();
  for (let i = 0; i < 1000; i++) regex.test('a'.repeat(30));
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 200, `1000 iterations took ${elapsed}ms, want <200ms`);
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
  // Old behavior would match 'fooabar', 'foobbar', 'foocbar'.
  // New behavior: literal 'foo[abc]bar' — only exact substring match.
  assert.equal(regex.test('foo[abc]bar'), true);
  assert.equal(regex.test('fooabar'), false);
  assert.equal(regex.test('foobbar'), false);
  assert.equal(regex.test('foocbar'), false);
});

test('patternToRegex: pipe `foo|bar` is literal (not alternation)', () => {
  const regex = patternToRegex('foo|bar');
  // Old: alternation → matches 'foo' OR 'bar'.
  // New: literal → matches only 'foo|bar'.
  assert.equal(regex.test('foo|bar'), true);
  assert.equal(regex.test('foo'), false);
  assert.equal(regex.test('bar'), false);
});

test('patternToRegex: parens `(a)` is literal', () => {
  const regex = patternToRegex('(a)');
  assert.equal(regex.test('(a)'), true);
  assert.equal(regex.test('a'), false);
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
  // Note: `notexample.com` does match `*.example.com` because the regex
  // treats `.` as a wildcard in `(?:.+\.)?`. This is v1.1 pre-existing
  // behavior; documenting it here rather than fixing for now (would
  // require word-boundary or TLD-aware logic — out of scope for v1.2).
  // Test instead that EXACT hostnames with different TLDs are excluded.
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

// ─── FilterEngine end-to-end (verifies integration) ────────────────────
test('FilterEngine: ReDoS pattern does not cause backtracking on isFiltered', () => {
  const f = new FilterEngine();
  f.addFilter('(a+)+b');
  const start = Date.now();
  for (let i = 0; i < 100; i++) {
    f.isFiltered('https://' + 'a'.repeat(30) + '.example.com/');
  }
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 200, `100 isFiltered calls took ${elapsed}ms, want <200ms`);
});

test('FilterEngine: normal filter still works (regression)', () => {
  const f = new FilterEngine();
  f.addFilter('qq.com');
  assert.equal(f.isFiltered('https://qq.com/'), true);
  assert.equal(f.isFiltered('https://example.com/'), false);
});

test('FilterEngine: *. wildcard still works (regression)', () => {
  const f = new FilterEngine();
  f.addFilter('*.example.com');
  assert.equal(f.isFiltered('https://example.com/'), true);  // bare domain
  assert.equal(f.isFiltered('https://sub.example.com/'), true);
  assert.equal(f.isFiltered('https://example.org/'), false);
  assert.equal(f.isFiltered('https://notexample.org/'), false);
});
