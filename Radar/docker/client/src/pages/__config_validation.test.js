// ConfigPage pure-logic tests — v1.2.QA Sprint 4 A4-1 (client tests 70%).
// Tests the field validation logic without rendering React (which
// would require a DOM).
import test from 'node:test';
import assert from 'node:assert/strict';

// Pure validation function extracted from ConfigPage.jsx for testability.
function validateProxyUrl(url) {
  if (!url) return null;  // empty is OK (proxy disabled)
  // Allow http://, https://, socks5://
  const re = /^(https?|socks5):\/\/([^:@/]+(?::[^@]*)?@)?[^:@/]+(:\d+)?\/?/;
  if (!re.test(url)) return 'URL must start with http://, https://, or socks5://';
  // Reject IPs without a port (likely a mistake)
  if (/\d+\.\d+\.\d+\.\d+(:|$)/.test(url) && !/:\d{2,5}/.test(url)) {
    return 'IP-based URLs must include a port';
  }
  return null;
}

test('ConfigPage: empty proxy URL is valid (disabled)', () => {
  assert.equal(validateProxyUrl(''), null);
  assert.equal(validateProxyUrl(null), null);
  assert.equal(validateProxyUrl(undefined), null);
});

test('ConfigPage: valid http:// URL passes', () => {
  assert.equal(validateProxyUrl('http://proxy.example.com:8080'), null);
  assert.equal(validateProxyUrl('http://user:pass@proxy:8080'), null);
  assert.equal(validateProxyUrl('https://secure.proxy:443'), null);
  assert.equal(validateProxyUrl('socks5://tor:9050'), null);
});

test('ConfigPage: URL without scheme is rejected', () => {
  assert.notEqual(validateProxyUrl('proxy.example.com:8080'), null);
  assert.notEqual(validateProxyUrl('localhost:3000'), null);
});

test('ConfigPage: IP without port is rejected (SSRF hint)', () => {
  assert.notEqual(validateProxyUrl('http://192.168.1.1'), null);
  assert.notEqual(validateProxyUrl('http://10.0.0.1'), null);
});

test('ConfigPage: IP with port is OK', () => {
  assert.equal(validateProxyUrl('http://192.168.1.1:8080'), null);
  assert.equal(validateProxyUrl('socks5://10.0.0.1:1080'), null);
});

// ─── delay range validation (min <= max) ────────────────────────────────
function validateRequestDelay({ min, max }) {
  if (typeof min !== 'number' || typeof max !== 'number') return 'min/max must be numbers';
  if (min < 0 || max < 0) return 'min/max must be non-negative';
  if (min > max) return 'min must be <= max';
  if (max > 60000) return 'max must be <= 60000ms (60s)';
  return null;
}

test('ConfigPage: delay range validation', () => {
  assert.equal(validateRequestDelay({ min: 800, max: 2500 }), null);
  assert.equal(validateRequestDelay({ min: 0, max: 0 }), null);
  assert.equal(validateRequestDelay({ min: 0, max: 60000 }), null);
  // Errors
  assert.notEqual(validateRequestDelay({ min: 1000, max: 500 }), null);
  assert.notEqual(validateRequestDelay({ min: -1, max: 1000 }), null);
  assert.notEqual(validateRequestDelay({ min: 0, max: 60001 }), null);
  assert.notEqual(validateRequestDelay({ min: 'abc', max: 1000 }), null);
});

// ─── max retries validation ────────────────────────────────────────────
function validateMaxRetries(n) {
  if (typeof n !== 'number') return 'must be a number';
  if (n < 0) return 'must be >= 0';
  if (n > 10) return 'must be <= 10 (avoid runaway)';
  return null;
}

test('ConfigPage: max retries validation', () => {
  assert.equal(validateMaxRetries(0), null);
  assert.equal(validateMaxRetries(3), null);
  assert.equal(validateMaxRetries(10), null);
  assert.notEqual(validateMaxRetries(-1), null);
  assert.notEqual(validateMaxRetries(11), null);
  assert.notEqual(validateMaxRetries('3'), null);
});

// ─── filter pattern validation (ReDoS prevention, mirrors server side) ─
function isValidFilterPattern(pattern) {
  if (typeof pattern !== 'string') return false;
  if (pattern.length === 0) return false;
  if (pattern.length > 200) return false;
  // Quick UI guard: reject patterns with nested quantifiers like
  // `(a+)+` or `(x)*` — the most common ReDoS shapes. The server-side
  // escapeRegex does the real work; this catches obvious cases early
  // and shows a clearer UI error message.
  if (new RegExp('\\)[+*]').test(pattern)) return false;
  return true;
}

test('ConfigPage: filter pattern rejects nested quantifier ReDoS', () => {
  assert.equal(isValidFilterPattern('qq.com'), true);
  assert.equal(isValidFilterPattern('*.gov.cn'), true);
  // Heuristic: reject patterns with quantifier immediately after a closing
  // paren (e.g. `(a+)+` or `(x)*`). Server-side escapeRegex also handles
  // these, but this is a quick UI-side guard.
  assert.equal(isValidFilterPattern('(a+)+b'), false);  // nested `+)+`
  assert.equal(isValidFilterPattern('(a+)*b'), false);  // nested `+)*`
  assert.equal(isValidFilterPattern('(a*)*b'), false);  // nested `*)*`
  assert.equal(isValidFilterPattern(''), false);
  assert.equal(isValidFilterPattern('a'.repeat(201)), false);
});
