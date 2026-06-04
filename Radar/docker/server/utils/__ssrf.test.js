// SSRF guard tests — covers isBlockedHost() for all private/loopback ranges.
// v1.2 fix: 9.2.1 + 9.2.2.
import test from 'node:test';
import assert from 'node:assert/strict';
import { isBlockedHost } from './ssrf.js';

// ─── Hostname aliases (always local) ────────────────────────────────────
for (const host of [
  'localhost',
  'LOCALHOST',
  'localhost.',
  '.localhost',
  'foo.localhost',
  'ip6-localhost',
  'ip6-loopback',
  'broadcasthost',
  '0.0.0.0',
]) {
  test(`blocks hostname alias "${host}"`, () => {
    assert.equal(isBlockedHost(host), true);
  });
}

// ─── IPv4 loopback (127.0.0.0/8) ─────────────────────────────────────────
for (const host of ['127.0.0.1', '127.1.2.3', '127.255.255.255']) {
  test(`blocks IPv4 loopback ${host}`, () => {
    assert.equal(isBlockedHost(host), true);
  });
}

// ─── IPv4 private (RFC 1918) ────────────────────────────────────────────
for (const host of [
  '10.0.0.1', '10.255.255.255',
  '172.16.0.1', '172.20.0.1', '172.31.255.255',
  '192.168.0.1', '192.168.1.100',
]) {
  test(`blocks IPv4 private ${host}`, () => {
    assert.equal(isBlockedHost(host), true);
  });
}

// ─── IPv4 private boundaries (should NOT be blocked) ────────────────────
for (const host of [
  '172.15.0.1',   // just below 172.16/12
  '172.32.0.1',   // just above 172.31
  '11.0.0.1',     // just above 10/8
  '9.255.255.255', // just below 10/8
]) {
  test(`does NOT block near-private IPv4 ${host}`, () => {
    assert.equal(isBlockedHost(host), false);
  });
}

// ─── IPv4 link-local + CGNAT + reserved ────────────────────────────────
for (const host of [
  '169.254.169.254',  // AWS metadata
  '100.64.0.1',        // CGNAT
  '100.127.255.255',
  '0.1.2.3',           // 0.0.0.0/8
  '192.0.0.1', '192.0.2.1',  // IETF reserved
  '198.18.0.1', '198.19.255.255',  // benchmark
  '224.0.0.1', '239.255.255.255',  // multicast
  '240.0.0.1', '255.255.255.255',  // reserved
]) {
  test(`blocks IPv4 reserved ${host}`, () => {
    assert.equal(isBlockedHost(host), true);
  });
}

// ─── IPv6 ──────────────────────────────────────────────────────────────
for (const host of [
  '::1',
  '::',
  'fe80::1',
  'fe80::abcd:1234',
  'febf::1',           // febf is in fe80/10
  'fc00::1', 'fcab::1',  // ULA fc00::/7
  'fd00::1', 'fdab::1',  // ULA fd00::/8
  'ff02::1', 'ff00::1',  // multicast
  '::ffff:169.254.169.254',
  '::ffff:1.2.3.4',
  '::ffff:a9fe:a9fe',  // normalized form
]) {
  test(`blocks IPv6 ${host}`, () => {
    assert.equal(isBlockedHost(host), true);
  });
}

// ─── IPv6 with brackets (WHATWG URL format) ────────────────────────────
test('strips WHATWG URL brackets from IPv6', () => {
  assert.equal(isBlockedHost('[::1]'), true);
  assert.equal(isBlockedHost('[fe80::1]'), true);
  assert.equal(isBlockedHost('[::ffff:1.2.3.4]'), true);
});

// ─── Public hosts (should NOT be blocked) ──────────────────────────────
for (const host of [
  'baidu.com',
  'www.baidu.com',
  'github.com',
  '8.8.8.8',         // Google DNS
  '1.1.1.1',         // Cloudflare DNS
  '2001:4860:4860::8888',  // Google DNS IPv6
  '2606:4700:4700::1111',  // Cloudflare DNS IPv6
  'google.com',
  'cdn.jsdelivr.net',
]) {
  test(`does NOT block public host ${host}`, () => {
    assert.equal(isBlockedHost(host), false);
  });
}

// ─── Edge cases ────────────────────────────────────────────────────────
test('blocks empty hostname', () => {
  assert.equal(isBlockedHost(''), true);
  assert.equal(isBlockedHost(null), true);
  assert.equal(isBlockedHost(undefined), true);
});

test('case-insensitive matching', () => {
  assert.equal(isBlockedHost('LOCALHOST'), true);
  assert.equal(isBlockedHost('LocalHost'), true);
  assert.equal(isBlockedHost('FE80::1'), true);
  assert.equal(isBlockedHost('::FFFF:1.2.3.4'), true);
});
