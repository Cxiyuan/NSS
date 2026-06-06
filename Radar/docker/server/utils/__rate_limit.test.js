// Rate limit middleware tests — v1.2.QA A1-3.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimit, createRateLimitWithReset } from './rate-limit.js';

// ─── Helper: build mock req/res ──────────────────────────────────────────
function mockReqRes(ip = '1.2.3.4', method = 'GET') {
  const headers = {};
  const req = {
    ip,
    socket: { remoteAddress: ip },
    headers,
    method,
  };
  const resHeaders = {};
  const res = {
    headers: resHeaders,
    setHeader(name, value) { resHeaders[name] = value; },
    getHeader(name) { return resHeaders[name]; },
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
  return { req, res };
}

// ─── createRateLimitWithReset: testable variant ─────────────────────────
test('rate limit: allows requests under the limit', () => {
  const sharedStore = new Map();
  const limit = createRateLimitWithReset({ windowMs: 60_000, max: 3 }, sharedStore);
  for (let i = 0; i < 3; i++) {
    const { req, res } = mockReqRes('1.2.3.4');
    let nextCalled = false;
    limit(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true, `request ${i + 1} should pass`);
    assert.equal(res.statusCode, 200);
  }
});

test('rate limit: blocks 4th request within window', () => {
  const sharedStore = new Map();
  const limit = createRateLimitWithReset({ windowMs: 60_000, max: 3 }, sharedStore);
  for (let i = 0; i < 3; i++) {
    const { req, res } = mockReqRes('1.2.3.4');
    limit(req, res, () => {});
  }
  // 4th should be blocked
  const { req, res } = mockReqRes('1.2.3.4');
  let nextCalled = false;
  limit(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false, '4th request should be blocked');
  assert.equal(res.statusCode, 429);
  assert.equal(res.body.error, 'rate_limited');
  assert.ok(res.getHeader('Retry-After'));
  assert.equal(res.getHeader('X-RateLimit-Limit'), '3');
  assert.equal(res.getHeader('X-RateLimit-Remaining'), '0');
});

test('rate limit: different IPs are independent', () => {
  const sharedStore = new Map();
  const limit = createRateLimitWithReset({ windowMs: 60_000, max: 2 }, sharedStore);
  // 1.2.3.4 uses up its quota
  for (let i = 0; i < 2; i++) limit(mockReqRes('1.2.3.4').req, mockReqRes().res, () => {});
  // 1.2.3.4 is now blocked
  let nextCalled = false;
  limit(mockReqRes('1.2.3.4').req, mockReqRes().res, () => { nextCalled = true; });
  assert.equal(nextCalled, false, '1.2.3.4 should be blocked');
  // 5.6.7.8 still has full quota
  nextCalled = false;
  limit(mockReqRes('5.6.7.8').req, mockReqRes().res, () => { nextCalled = true; });
  assert.equal(nextCalled, true, '5.6.7.8 should pass');
});

test('rate limit: sliding window (old requests expire)', async () => {
  const sharedStore = new Map();
  const limit = createRateLimitWithReset({ windowMs: 100, max: 2 }, sharedStore);
  for (let i = 0; i < 2; i++) limit(mockReqRes('1.2.3.4').req, mockReqRes().res, () => {});
  // 3rd blocked
  let nextCalled = false;
  limit(mockReqRes('1.2.3.4').req, mockReqRes().res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  // Wait for window to slide
  await new Promise(r => setTimeout(r, 110));
  // Now allowed
  nextCalled = false;
  limit(mockReqRes('1.2.3.4').req, mockReqRes().res, () => { nextCalled = true; });
  assert.equal(nextCalled, true, 'should pass after window slides');
});

test('rate limit: uses X-Forwarded-For when present', () => {
  const sharedStore = new Map();
  const limit = createRateLimitWithReset({ windowMs: 60_000, max: 2 }, sharedStore);
  // Two requests from "1.2.3.4" via XFF — should use first hop
  for (let i = 0; i < 2; i++) {
    const { req, res } = mockReqRes('127.0.0.1');  // socket IP is different
    req.headers['x-forwarded-for'] = '1.2.3.4, 10.0.0.1';
    limit(req, res, () => {});
  }
  // 3rd from 1.2.3.4 (via XFF) blocked
  let nextCalled = false;
  const { req, res } = mockReqRes('127.0.0.1');
  req.headers['x-forwarded-for'] = '1.2.3.4, 10.0.0.1';
  limit(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false, 'XFF-based rate limit should block 3rd request');
});

test('rate limit: custom keyFn', () => {
  const sharedStore = new Map();
  const limit = createRateLimitWithReset(
    { windowMs: 60_000, max: 2, keyFn: (req) => req.userId || req.ip },
    sharedStore
  );
  for (let i = 0; i < 2; i++) {
    const { req, res } = mockReqRes('1.1.1.1');
    req.userId = 'user-42';
    limit(req, res, () => {});
  }
  // Different user, same IP — should NOT be blocked
  let nextCalled = false;
  const { req, res } = mockReqRes('1.1.1.1');
  req.userId = 'user-99';
  limit(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test('rate limit: X-RateLimit-Remaining decrements correctly', () => {
  const sharedStore = new Map();
  const limit = createRateLimitWithReset({ windowMs: 60_000, max: 5 }, sharedStore);
  for (let i = 0; i < 3; i++) {
    const { req, res } = mockReqRes('1.2.3.4');
    limit(req, res, () => {});
    const expected = String(5 - (i + 1));
    assert.equal(res.getHeader('X-RateLimit-Remaining'), expected, `after request ${i + 1}`);
  }
});

test('rate limit: Retry-After header reflects oldest timestamp', () => {
  const sharedStore = new Map();
  const limit = createRateLimitWithReset({ windowMs: 60_000, max: 1 }, sharedStore);
  const { req: r1, res: s1 } = mockReqRes('1.2.3.4');
  limit(r1, s1, () => {});
  // Wait 100ms
  return new Promise((resolve) => {
    setTimeout(() => {
      const { req, res } = mockReqRes('1.2.3.4');
      limit(req, res, () => {});
      const retryAfter = Number(res.getHeader('Retry-After'));
      assert.ok(retryAfter > 0 && retryAfter <= 60, `Retry-After should be 1-60, got ${retryAfter}`);
      resolve();
    }, 100);
  });
});

// ─── createRateLimit: production factory (no sharedStore) ────────────────
test('createRateLimit: production factory works without sharedStore', () => {
  const limit = createRateLimit({ windowMs: 60_000, max: 2 });
  for (let i = 0; i < 2; i++) {
    const { req, res } = mockReqRes('1.2.3.4');
    let nextCalled = false;
    limit(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
  }
  // 3rd blocked
  const { req, res } = mockReqRes('1.2.3.4');
  let nextCalled = false;
  limit(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 429);
});
