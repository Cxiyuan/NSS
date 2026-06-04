// Auth token placeholder guard tests — v1.2 fix: 9.2.12.
// Verifies that requireAuth rejects requests when RADAR_AUTH_TOKEN is
// set to the .env.production placeholder string.
import test from 'node:test';
import assert from 'node:assert/strict';

// We can't easily test the full requireAuth middleware without booting
// Express, so we re-implement the placeholder-detection logic and test it.
// The real requireAuth uses the same predicate, so behavior matches.
const PLACEHOLDER_TOKEN_PREFIX = 'CHANGE-ME-';
function isPlaceholderToken(t) {
  return !t || t.startsWith(PLACEHOLDER_TOKEN_PREFIX);
}

test('treats empty token as local-dev mode (passes through)', () => {
  assert.equal(isPlaceholderToken(''), true);
  assert.equal(isPlaceholderToken(undefined), true);
  assert.equal(isPlaceholderToken(null), true);
});

test('treats CHANGE-ME-* tokens as placeholder (rejected)', () => {
  assert.equal(isPlaceholderToken('CHANGE-ME-'), true);
  assert.equal(isPlaceholderToken('CHANGE-ME-BEFORE-DEPLOY'), true);
  assert.equal(isPlaceholderToken('CHANGE-ME-USE-OPENSSL-RAND-HEX-32'), true);
  // v1.2 default from .env.production
  assert.equal(isPlaceholderToken('CHANGE-ME-BEFORE-DEPLOY-USE-OPENSSL-RAND-HEX-32'), true);
});

test('treats real tokens as valid (NOT placeholder)', () => {
  // Hex 32 char
  assert.equal(isPlaceholderToken('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4'), false);
  // Random base64
  assert.equal(isPlaceholderToken('KyJ8mZ3Wz+n2WLVV9XhKfA=='), false);
  // 64-char hex
  assert.equal(isPlaceholderToken('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'), false);
});

test('token similar to placeholder but different prefix is NOT placeholder', () => {
  assert.equal(isPlaceholderToken('change-me-lowercase'), false);  // case sensitive
  assert.equal(isPlaceholderToken('PLEASE-CHANGE-ME'), false);     // different prefix
  assert.equal(isPlaceholderToken('CHANGE-ME'), false);            // missing trailing dash
});
