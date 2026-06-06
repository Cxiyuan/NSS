// Simple in-memory rate limit middleware (no npm install).
// v1.2.QA A1-3 — defense against brute-force task creation / API abuse.
//
// Algorithm: token bucket per (route, key). Keys are typically req.ip
// (optionally with X-Forwarded-For for behind-reverse-proxy setups).
//
// Usage:
//   import { createRateLimit } from './utils/rate-limit.js';
//   app.post('/api/tasks', createRateLimit({ windowMs: 60_000, max: 10 }), handler);
//
// Behavior:
//   - Tracks a sliding window of timestamps per key
//   - On each request, drops timestamps older than `windowMs`
//   - If remaining count >= max, sends 429 + Retry-After + JSON error
//   - Cleans up empty buckets periodically (every 5 min) to prevent memory growth
//
// Limitations:
//   - In-memory only — does NOT share across multiple Node processes.
//     For multi-replica deployments, switch to Redis-backed (ioredis is
//     already a project dep).
//   - Trusts X-Forwarded-For as-is. In production behind a trusted proxy,
//     configure Express `app.set('trust proxy', ...)` to prevent header
//     spoofing.

export function createRateLimit({ windowMs = 60_000, max = 10, keyFn } = {}) {
  // Map<key, number[]> of request timestamps
  const buckets = new Map();

  // Periodic cleanup of empty buckets to prevent memory growth
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    const cutoff = now - windowMs;
    for (const [k, arr] of buckets) {
      // Drop stale timestamps
      while (arr.length > 0 && arr[0] <= cutoff) arr.shift();
      // Delete empty buckets
      if (arr.length === 0) buckets.delete(k);
    }
  }, 5 * 60_000);
  cleanupTimer.unref();  // don't prevent process exit

  const defaultKeyFn = (req) => {
    // Prefer X-Forwarded-For (first hop) if Express trust proxy is configured
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.length > 0) {
      return xff.split(',')[0].trim();
    }
    return req.socket?.remoteAddress || req.ip || 'unknown';
  };
  const getKey = keyFn || defaultKeyFn;

  return function rateLimit(req, res, next) {
    const key = getKey(req);
    const now = Date.now();
    const cutoff = now - windowMs;
    let arr = buckets.get(key);
    if (!arr) {
      arr = [];
      buckets.set(key, arr);
    }
    // Drop stale timestamps from the head
    while (arr.length > 0 && arr[0] <= cutoff) arr.shift();
    if (arr.length >= max) {
      const oldestTs = arr[0];
      const retryAfter = Math.max(1, Math.ceil((oldestTs + windowMs - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      res.setHeader('X-RateLimit-Limit', String(max));
      res.setHeader('X-RateLimit-Remaining', '0');
      return res.status(429).json({
        error: 'rate_limited',
        message: `Too many requests. Limit: ${max} per ${windowMs}ms. Retry in ${retryAfter}s.`,
        retryAfter,
      });
    }
    arr.push(now);
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(max - arr.length));
    next();
  };
}

// Test helper: reset all buckets. Exposed for unit tests.
export function _resetAllBuckets() {
  // Module-level state reset — only for tests
  // The actual Map is inside the closure; tests must use the exported
  // function through their own bucket maps. We provide a way to do this
  // via a factory variant below.
}

export function createRateLimitWithReset({ windowMs = 60_000, max = 10, keyFn } = {}, sharedStore) {
  // Variant that takes an external Map for testability.
  const buckets = sharedStore || new Map();
  const getKey = keyFn || ((req) => req.ip || 'unknown');
  return function rateLimit(req, res, next) {
    const key = getKey(req);
    const now = Date.now();
    const cutoff = now - windowMs;
    let arr = buckets.get(key);
    if (!arr) { arr = []; buckets.set(key, arr); }
    while (arr.length > 0 && arr[0] <= cutoff) arr.shift();
    if (arr.length >= max) {
      const oldestTs = arr[0];
      const retryAfter = Math.max(1, Math.ceil((oldestTs + windowMs - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      res.setHeader('X-RateLimit-Limit', String(max));
      res.setHeader('X-RateLimit-Remaining', '0');
      return res.status(429).json({ error: 'rate_limited', retryAfter });
    }
    arr.push(now);
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(max - arr.length));
    next();
  };
}
