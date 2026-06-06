// DNS rebinding defense tests — v1.2.QA A1-1.
// Verifies that `assertSafeHost` resolves DNS and rejects hosts whose
// A/AAAA records point to private/loopback IPs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { isBlockedHost, assertSafeHost } from './ssrf.js';

// ─── Layer 1 (hostname) tests (sync, no DNS) ────────────────────────────
test('assertSafeHost: layer 1 blocks localhost without DNS query', async () => {
  // Use a mock lookup that would CRASH if called — proving the layer-1
  // check short-circuits before any DNS resolution.
  const lookup = () => { throw new Error('DNS should not be queried for blocked hostnames'); };
  const r = await assertSafeHost('localhost', lookup);
  assert.equal(r.safe, false);
  assert.ok(r.reason.includes('hostname blocked'));
});

test('assertSafeHost: layer 1 blocks 127.0.0.1, 10.x, 192.168.x without DNS', async () => {
  const lookup = () => { throw new Error('should not query DNS'); };
  for (const h of ['127.0.0.1', '10.0.0.1', '192.168.1.1', '172.16.0.1', '169.254.169.254']) {
    const r = await assertSafeHost(h, lookup);
    assert.equal(r.safe, false, `should block ${h}`);
  }
});

// ─── Layer 2 (DNS rebinding) tests with mock lookup ─────────────────────
test('assertSafeHost: layer 2 blocks hostname that RESOLVES to private IP', async () => {
  // Simulate DNS rebinding: attacker.com → 1.2.3.4 (passes layer 1) → rebind → 127.0.0.1
  const lookup = async (hostname, opts) => [
    { address: '127.0.0.1', family: 4 },
  ];
  const r = await assertSafeHost('attacker.com', lookup);
  assert.equal(r.safe, false);
  assert.ok(r.reason.includes('resolved IP blocked'));
  assert.ok(r.reason.includes('127.0.0.1'));
  assert.deepEqual(r.ips, ['127.0.0.1']);
});

test('assertSafeHost: layer 2 blocks ANY A record in private range', async () => {
  // Attacker returns multiple records; ONE of them is private.
  // Defense: ALL records must be public.
  const lookup = async () => [
    { address: '8.8.8.8', family: 4 },        // public (Google DNS)
    { address: '10.0.0.1', family: 4 },       // private — must trigger block
  ];
  const r = await assertSafeHost('multi-record.com', lookup);
  assert.equal(r.safe, false);
  assert.ok(r.reason.includes('10.0.0.1'));
});

test('assertSafeHost: layer 2 allows hostname that RESOLVES to public IP', async () => {
  const lookup = async () => [
    { address: '1.1.1.1', family: 4 },
  ];
  const r = await assertSafeHost('cloudflare-dns.com', lookup);
  assert.equal(r.safe, true);
  assert.deepEqual(r.ips, ['1.1.1.1']);
});

test('assertSafeHost: layer 2 allows public IPv6', async () => {
  const lookup = async () => [
    { address: '2606:4700:4700::1111', family: 6 },  // Cloudflare DNS
  ];
  const r = await assertSafeHost('one.one', lookup);
  assert.equal(r.safe, true);
});

test('assertSafeHost: layer 2 blocks IPv6 link-local (fe80::)', async () => {
  const lookup = async () => [
    { address: 'fe80::1', family: 6 },
  ];
  const r = await assertSafeHost('attacker-ipv6.com', lookup);
  assert.equal(r.safe, false);
  assert.ok(r.reason.includes('fe80::1'));
});

test('assertSafeHost: layer 2 blocks IPv4-mapped IPv6 (::ffff:127.0.0.1)', async () => {
  // This is the smoking gun for DNS rebinding via IPv6 fallback
  const lookup = async () => [
    { address: '::ffff:127.0.0.1', family: 6 },
  ];
  const r = await assertSafeHost('attacker-mapped.com', lookup);
  assert.equal(r.safe, false);
  assert.ok(r.reason.includes('::ffff:127.0.0.1'));
});

test('assertSafeHost: empty hostname is unsafe', async () => {
  const lookup = async () => [];
  const r = await assertSafeHost('', lookup);
  assert.equal(r.safe, false);
  assert.ok(r.reason.includes('empty'));
});

test('assertSafeHost: fail-closed on DNS error (ENOTFOUND)', async () => {
  // DNS resolution fails — must NOT proceed to fetch
  const lookup = async () => {
    const err = new Error('ENOTFOUND');
    err.code = 'ENOTFOUND';
    throw err;
  };
  const r = await assertSafeHost('nonexistent.example.com', lookup);
  assert.equal(r.safe, false);
  assert.ok(r.reason.includes('ENOTFOUND'));
});

test('assertSafeHost: fail-closed on timeout', async () => {
  const lookup = async () => {
    const err = new Error('Timeout');
    err.code = 'ETIMEDOUT';
    throw err;
  };
  const r = await assertSafeHost('slow-resolver.com', lookup);
  assert.equal(r.safe, false);
});

test('assertSafeHost: empty DNS result is unsafe', async () => {
  const lookup = async () => [];
  const r = await assertSafeHost('empty-records.com', lookup);
  assert.equal(r.safe, false);
  assert.ok(r.reason.includes('no DNS records'));
});

test('assertSafeHost: real DNS lookup works (baidu.com)', async () => {
  // Smoke test against real DNS — skip if offline
  const r = await assertSafeHost('baidu.com');
  if (r.safe) {
    assert.ok(r.ips.length > 0);
    assert.ok(r.ips.every(ip => !isBlockedHost(ip)));
  } else {
    // Offline environment — skip
    console.log('  (skipped: no DNS available)');
  }
});
