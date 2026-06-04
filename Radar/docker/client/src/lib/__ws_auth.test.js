// WebSocket auth helper tests — v1.2 fix: 9.2.4.
// Verifies that the helper returns the right args for `new WebSocket(url, protocols)`
// so the token is sent via Sec-WebSocket-Protocol header, not in the URL.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWebSocketAuthArgs, buildWebSocketUrlWithTokenFallback } from './ws-auth.js';

test('buildWebSocketAuthArgs: no token returns [url]', () => {
  const args = buildWebSocketAuthArgs('wss://host/ws?taskId=1', '');
  assert.deepEqual(args, ['wss://host/ws?taskId=1']);
});

test('buildWebSocketAuthArgs: no token returns [url] (null/undefined)', () => {
  assert.deepEqual(buildWebSocketAuthArgs('wss://host/ws', null), ['wss://host/ws']);
  assert.deepEqual(buildWebSocketAuthArgs('wss://host/ws', undefined), ['wss://host/ws']);
});

test('buildWebSocketAuthArgs: with token returns [url, [token]] for protocol header', () => {
  const args = buildWebSocketAuthArgs('wss://host/ws?taskId=1', 'mytoken123');
  assert.deepEqual(args, ['wss://host/ws?taskId=1', ['mytoken123']]);
});

test('buildWebSocketAuthArgs: token is NOT appended to URL (no query string leak)', () => {
  const url = 'wss://host/ws?taskId=1';
  const [u, protocols] = buildWebSocketAuthArgs(url, 'mytoken123');
  // CRITICAL: URL must not contain the token — it goes via protocol header
  assert.equal(u, url);
  assert.equal(u.includes('token='), false);
  assert.ok(protocols.includes('mytoken123'));
});

test('buildWebSocketAuthArgs: hex token (typical openssl rand -hex 32)', () => {
  const token = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';
  const [u, protocols] = buildWebSocketAuthArgs('wss://host/ws', token);
  assert.equal(u.includes(token), false);
  assert.deepEqual(protocols, [token]);
});

// ─── URL fallback (only used on old browser / exception path) ───────────
test('buildWebSocketUrlWithTokenFallback: appends token to query string', () => {
  const url = buildWebSocketUrlWithTokenFallback('wss://host/ws', 'mytoken');
  assert.equal(url, 'wss://host/ws?token=mytoken');
});

test('buildWebSocketUrlWithTokenFallback: preserves existing query params', () => {
  const url = buildWebSocketUrlWithTokenFallback('wss://host/ws?taskId=1', 'mytoken');
  assert.equal(url, 'wss://host/ws?taskId=1&token=mytoken');
});

test('buildWebSocketUrlWithTokenFallback: URL-encodes special chars in token', () => {
  const url = buildWebSocketUrlWithTokenFallback('wss://host/ws', 'a/b+c=');
  assert.equal(url, 'wss://host/ws?token=a%2Fb%2Bc%3D');
});

test('buildWebSocketUrlWithTokenFallback: empty token returns original URL', () => {
  const url = buildWebSocketUrlWithTokenFallback('wss://host/ws', '');
  assert.equal(url, 'wss://host/ws');
});
