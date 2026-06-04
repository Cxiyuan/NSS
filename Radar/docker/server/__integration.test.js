// End-to-end integration test for the worker → handler → DB message flow.
// Verifies P0-1 (F-1 broken link fix), P0-2 (blacklink tag injection), and
// P1-1 (ICP footer fallback) all wire up correctly through the real
// `createWorkerMessageHandler`.
//
// Uses node:sqlite (Node 22+ built-in) as a stand-in for better-sqlite3
// to avoid the npm install restriction. A shim adds `db.pragma(sql)` since
// node:sqlite does not expose it natively.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { initDB } from './db/schema.js';
import { createQueries } from './db/queries.js';
import { createWorkerMessageHandler } from './worker-message-handler.js';
import { extractIcpFromHtml } from './utils/icp-extractor.js';
import { detectBlacklinkFromAttrs } from './crawler/blacklink-patterns.js';

// ─── node:sqlite compatibility shim ────────────────────────────────────
// better-sqlite3 exposes db.pragma(sql). node:sqlite does not — wire one up
// that handles both "PRAGMA x = y" (mutate) and "PRAGMA x" (query) forms.
function installPragmaShim(db) {
  db.pragma = function (sql) {
    if (/=/.test(sql)) {
      db.exec(`PRAGMA ${sql}`);
      return [];
    }
    return db.prepare(`PRAGMA ${sql}`).all();
  };
}

// ─── Test harness ──────────────────────────────────────────────────────
function freshDb() {
  const db = new DatabaseSync(':memory:');
  installPragmaShim(db);
  initDB(db);
  return db;
}

function freshRedis() {
  // Mock redis that behaves like a no-op cache.
  // For 'result' message: returns false (caller falls back to SQLite).
  return {
    connected: false,
    async pushResult() { return false; },
    async flushToSQLite() { return 0; },
  };
}

function freshBroadcast() {
  const sent = [];
  return {
    sent,
    fn(taskId, msg) { sent.push({ taskId, msg }); },
  };
}

function setup() {
  const db = freshDb();
  const queries = createQueries(db);
  const redis = freshRedis();
  const broadcast = freshBroadcast();
  const handler = createWorkerMessageHandler({ queries, redis, getBroadcast: () => broadcast.fn });
  // Seed a task so insertResult has a valid FK target
  queries.createTask({ id: 't1', type: 'url_crawl', config: { url: 'https://x' } });
  return { db, queries, redis, broadcast, handler };
}

async function insertResult(handler, taskId, url) {
  await handler(taskId, {
    type: 'result',
    result: {
      url,
      foundOn: 'https://x',
      linkType: 'a',
      isExternal: true,
      depth: 1,
      pageTitle: '',
      statusCode: 0,
    },
  });
}

// ─── F-1 broken link regression: result_tags must persist to DB ─────────
test('F-1 regression: result_tags message persists to DB', async () => {
  const { handler, db } = setup();
  await insertResult(handler, 't1', 'https://evil.tk/page');
  await handler('t1', {
    type: 'result_tags',
    url: 'https://evil.tk/page',
    tags: ['free-tld:1', 'porn:2'],
  });
  const row = db.prepare('SELECT risk_level, risk_tags, icp FROM results WHERE url = ?').get('https://evil.tk/page');
  assert.equal(row.risk_level, 'suspicious');
  assert.equal(row.risk_tags, 'free-tld:1,porn:2');
  assert.equal(row.icp, '');
});

// ─── P0-2: blacklink tag (from link-extractor → detect) persists ────────
test('P0-2: blacklink tag from link-extractor reaches DB', async () => {
  const { handler, db } = setup();
  await insertResult(handler, 't1', 'https://spam.example/x');
  // Simulate worker.js: link.hidden = true → preTags = ['blacklink:1:css-hide']
  const preTags = ['blacklink:1:css-hide'];
  const tags = [...preTags, 'free-tld:1'];
  await handler('t1', {
    type: 'result_tags',
    url: 'https://spam.example/x',
    tags,
  });
  const row = db.prepare('SELECT risk_tags FROM results WHERE url = ?').get('https://spam.example/x');
  assert.equal(row.risk_tags, 'blacklink:1:css-hide,free-tld:1');
});

// ─── P1-1: ICP footer fallback — icp-only message persists ─────────────
test('P1-1: icp-only message (no tags) persists ICP to DB', async () => {
  const { handler, db } = setup();
  await insertResult(handler, 't1', 'https://acme.cn');
  await handler('t1', {
    type: 'result_tags',
    url: 'https://acme.cn',
    tags: [],
    icp: '京ICP备12345678号',
  });
  const row = db.prepare('SELECT risk_level, risk_tags, icp FROM results WHERE url = ?').get('https://acme.cn');
  assert.equal(row.risk_level, 'suspicious');  // default for icp-only
  assert.equal(row.icp, '京ICP备12345678号');
  assert.equal(row.risk_tags, '');
});

// ─── P1-1: footer extraction → handler → DB full chain ─────────────────
test('P1-1: extractIcpFromHtml + handler chain ends with ICP in DB', async () => {
  const { handler, db } = setup();
  await insertResult(handler, 't1', 'https://acme.cn');
  const html = `
    <footer>
      <a href="https://beian.miit.gov.cn/">京ICP备20240001号</a>
      <a href="https://beian.mps.gov.cn/">公网安备 11010102000001 号</a>
    </footer>`;
  const footer = extractIcpFromHtml(html);
  assert.ok(footer);
  await handler('t1', {
    type: 'result_tags',
    url: 'https://acme.cn',
    tags: [],
    icp: footer.icp,
  });
  const row = db.prepare('SELECT icp FROM results WHERE url = ?').get('https://acme.cn');
  assert.equal(row.icp, '京ICP备20240001号');
});

// ─── Boundary: empty tags + empty icp is no-op (no DB write) ───────────
test('empty result_tags (no tags, no icp) is dropped — no DB write', async () => {
  const { handler, db } = setup();
  await insertResult(handler, 't1', 'https://clean.com/');
  await handler('t1', {
    type: 'result_tags',
    url: 'https://clean.com/',
    tags: [],
    icp: '',
  });
  const row = db.prepare('SELECT risk_level, risk_tags, icp FROM results WHERE url = ?').get('https://clean.com/');
  // No detection happened, so risk fields stay at their defaults
  assert.equal(row.risk_level, 'clean');
  assert.equal(row.risk_tags, '');
  assert.equal(row.icp, '');
});

// ─── Race: result_tags arrives BEFORE result row exists (safe no-op) ───
test('result_tags arriving before result INSERT is a safe no-op', async () => {
  const { handler, db } = setup();
  // No insertResult call — race scenario
  await handler('t1', {
    type: 'result_tags',
    url: 'https://racy.tk/whatever',
    tags: ['free-tld:1'],
  });
  // The UPDATE matches 0 rows (no-op, not an error)
  const rows = db.prepare('SELECT * FROM results WHERE url = ?').all('https://racy.tk/whatever');
  assert.equal(rows.length, 0);
  // No exception thrown — handler must not crash on missing row
});

// ─── Multiple result isolation: tags don't bleed between rows ──────────
test('multiple results keep independent risk fields', async () => {
  const { handler, db } = setup();
  await insertResult(handler, 't1', 'https://a.com/');
  await insertResult(handler, 't1', 'https://b.com/');
  await insertResult(handler, 't1', 'https://c.cn/');
  await handler('t1', { type: 'result_tags', url: 'https://a.com/', tags: ['porn:1'] });
  await handler('t1', { type: 'result_tags', url: 'https://b.com/', tags: ['gambling:2'] });
  await handler('t1', { type: 'result_tags', url: 'https://c.cn/', tags: [], icp: '沪ICP备20240001号' });
  const a = db.prepare('SELECT * FROM results WHERE url = ?').get('https://a.com/');
  const b = db.prepare('SELECT * FROM results WHERE url = ?').get('https://b.com/');
  const c = db.prepare('SELECT * FROM results WHERE url = ?').get('https://c.cn/');
  assert.equal(a.risk_tags, 'porn:1');
  assert.equal(a.icp, '');
  assert.equal(b.risk_tags, 'gambling:2');
  assert.equal(b.icp, '');
  assert.equal(c.risk_tags, '');
  assert.equal(c.icp, '沪ICP备20240001号');
});

// ─── WS broadcast side-effect ──────────────────────────────────────────
test('result_tags message is also broadcast to WS clients', async () => {
  const { handler, broadcast } = setup();
  await insertResult(handler, 't1', 'https://x.tk/y');
  await handler('t1', { type: 'result_tags', url: 'https://x.tk/y', tags: ['free-tld:1'] });
  const found = broadcast.sent.find(s => s.msg.type === 'result_tags');
  assert.ok(found, 'result_tags should be broadcast');
  assert.equal(found.taskId, 't1');
  assert.deepEqual(found.msg.tags, ['free-tld:1']);
});

test('empty result_tags is NOT broadcast (saves WS traffic)', async () => {
  const { handler, broadcast } = setup();
  await insertResult(handler, 't1', 'https://x.tk/y');
  broadcast.sent.length = 0;  // clear
  await handler('t1', { type: 'result_tags', url: 'https://x.tk/y', tags: [], icp: '' });
  const found = broadcast.sent.find(s => s.msg.type === 'result_tags');
  assert.equal(found, undefined);
});

// ─── Schema correctness: results table has risk columns ────────────────
test('results table has risk_level / risk_tags / icp columns (P0-1 fix)', () => {
  const db = freshDb();
  const cols = db.prepare('PRAGMA table_info(results)').all().map(c => c.name);
  assert.ok(cols.includes('risk_level'), 'risk_level missing');
  assert.ok(cols.includes('risk_tags'), 'risk_tags missing');
  assert.ok(cols.includes('icp'), 'icp missing');
});

// ─── Blacklink + ICP together: full P0-2 + P1-1 ────────────────────────
test('P0-2 + P1-1 combined: blacklink detection + footer ICP in one message', async () => {
  const { handler, db } = setup();
  await insertResult(handler, 't1', 'https://spam.cn/hidden');
  // Simulate: hidden link detected by link-extractor, AND footer ICP found
  const preTags = ['blacklink:1:css-hide'];
  const tags = [...preTags];
  const icp = extractIcpFromHtml('京ICP备12345678号')?.icp;
  assert.equal(icp, '京ICP备12345678号');
  await handler('t1', { type: 'result_tags', url: 'https://spam.cn/hidden', tags, icp });
  const row = db.prepare('SELECT risk_tags, icp FROM results WHERE url = ?').get('https://spam.cn/hidden');
  assert.equal(row.risk_tags, 'blacklink:1:css-hide');
  assert.equal(row.icp, '京ICP备12345678号');
});

// ─── v1.2: getResults supports icp + riskLevel filters ───────────────
import { createQueries as createQueriesReal } from './db/queries.js';

test('v1.2: getResults with icp filter returns only matching rows', () => {
  const db = freshDb();
  const queries = createQueriesReal(db);
  queries.createTask({ id: 't1', type: 'url_crawl', config: { url: 'https://x' } });
  // Insert 3 results with different ICPs
  queries.insertResult('t1', { url: 'https://a.cn', foundOn: 'https://x', linkType: 'a', isExternal: true, depth: 1, pageTitle: '', statusCode: 0, snippet: '' });
  queries.insertResult('t1', { url: 'https://b.cn', foundOn: 'https://x', linkType: 'a', isExternal: true, depth: 1, pageTitle: '', statusCode: 0, snippet: '' });
  queries.insertResult('t1', { url: 'https://c.cn', foundOn: 'https://x', linkType: 'a', isExternal: true, depth: 1, pageTitle: '', statusCode: 0, snippet: '' });
  queries.updateResultRisk('t1', 'https://a.cn', 'clean', '', '京ICP备12345678号');
  queries.updateResultRisk('t1', 'https://b.cn', 'suspicious', 'porn:1', '沪ICP备20240001号');
  // c.cn has no ICP

  const jing = queries.getResults('t1', { icp: '京' });
  assert.equal(jing.total, 1);
  assert.equal(jing.results[0].url, 'https://a.cn');

  const hu = queries.getResults('t1', { icp: '沪' });
  assert.equal(hu.total, 1);
  assert.equal(hu.results[0].url, 'https://b.cn');

  const noIcp = queries.getResults('t1', { icp: '' });
  assert.equal(noIcp.total, 1);
  assert.equal(noIcp.results[0].url, 'https://c.cn');
});

test('v1.2: getResults with riskLevel filter returns only matching rows', () => {
  const db = freshDb();
  const queries = createQueriesReal(db);
  queries.createTask({ id: 't1', type: 'url_crawl', config: { url: 'https://x' } });
  queries.insertResult('t1', { url: 'https://a.com', foundOn: 'https://x', linkType: 'a', isExternal: true, depth: 1, pageTitle: '', statusCode: 0, snippet: '' });
  queries.insertResult('t1', { url: 'https://b.com', foundOn: 'https://x', linkType: 'a', isExternal: true, depth: 1, pageTitle: '', statusCode: 0, snippet: '' });
  queries.updateResultRisk('t1', 'https://a.com', 'illegal', 'porn:1', '');
  queries.updateResultRisk('t1', 'https://b.com', 'clean', '', '');

  const illegal = queries.getResults('t1', { riskLevel: 'illegal' });
  assert.equal(illegal.total, 1);
  assert.equal(illegal.results[0].url, 'https://a.com');

  const clean = queries.getResults('t1', { riskLevel: 'clean' });
  assert.equal(clean.total, 1);
  assert.equal(clean.results[0].url, 'https://b.com');
});

test('v1.2: getResults with no icp/risk filter returns all rows (backward compat)', () => {
  const db = freshDb();
  const queries = createQueriesReal(db);
  queries.createTask({ id: 't1', type: 'url_crawl', config: { url: 'https://x' } });
  queries.insertResult('t1', { url: 'https://a.com', foundOn: 'https://x', linkType: 'a', isExternal: true, depth: 1, pageTitle: '', statusCode: 0, snippet: '' });
  queries.insertResult('t1', { url: 'https://b.com', foundOn: 'https://x', linkType: 'a', isExternal: true, depth: 1, pageTitle: '', statusCode: 0, snippet: '' });
  const all = queries.getResults('t1');
  assert.equal(all.total, 2);
});

test('v1.2: getResults combines domain + icp + riskLevel filters (AND logic)', () => {
  const db = freshDb();
  const queries = createQueriesReal(db);
  queries.createTask({ id: 't1', type: 'url_crawl', config: { url: 'https://x' } });
  queries.insertResult('t1', { url: 'https://cn-a.com', foundOn: 'https://x', linkType: 'a', isExternal: true, depth: 1, pageTitle: '', statusCode: 0, snippet: '' });
  queries.insertResult('t1', { url: 'https://cn-b.com', foundOn: 'https://x', linkType: 'a', isExternal: true, depth: 1, pageTitle: '', statusCode: 0, snippet: '' });
  queries.updateResultRisk('t1', 'https://cn-a.com', 'illegal', 'porn:1', '京ICP备12345678号');
  queries.updateResultRisk('t1', 'https://cn-b.com', 'clean', '', '京ICP备87654321号');

  // domain 'cn' AND icp '京' AND riskLevel 'illegal' → 1 result
  const filtered = queries.getResults('t1', { domain: 'cn', icp: '京', riskLevel: 'illegal' });
  assert.equal(filtered.total, 1);
  assert.equal(filtered.results[0].url, 'https://cn-a.com');
});

// ─── v1.2 9.2.9: missing handler coverage for result / result_title / status ─

// 'result' message: main data path — Redis push + SQLite fallback + stats + WS.
test('handler: result message falls back to SQLite when Redis unavailable', async () => {
  const { handler, db, redis } = setup();
  // Wrap pushResult to count calls
  let pushedCount = 0;
  const originalPush = redis.pushResult;
  redis.pushResult = async (taskId, result) => {
    pushedCount++;
    return await originalPush(taskId, result);
  };
  const resultMsg = {
    type: 'result',
    result: {
      url: 'https://example.com/a',
      foundOn: 'https://x',
      linkType: 'a',
      isExternal: true,
      depth: 2,
      pageTitle: 'Page A',
      statusCode: 200,
    },
  };
  await handler('t1', resultMsg);
  // Verify row exists in SQLite (Redis fallback path)
  const row = db.prepare('SELECT url, page_title, status_code, depth FROM results WHERE url = ?').get('https://example.com/a');
  assert.ok(row, 'result row should be in SQLite');
  assert.equal(row.page_title, 'Page A');
  assert.equal(row.status_code, 200);
  assert.equal(row.depth, 2);
  // Verify Redis.pushResult was called
  assert.equal(pushedCount, 1);
});

test('handler: result message is broadcast to WS clients', async () => {
  const { handler, broadcast } = setup();
  await handler('t1', {
    type: 'result',
    result: {
      url: 'https://x.com/',
      foundOn: 'https://seed.com',
      linkType: 'a',
      isExternal: true,
      depth: 1,
      pageTitle: '',
      statusCode: 0,
    },
  });
  const found = broadcast.sent.find(s => s.msg.type === 'result');
  assert.ok(found, 'result should be broadcast');
  assert.equal(found.taskId, 't1');
  assert.equal(found.msg.result.url, 'https://x.com/');
});

test('handler: result message uses Redis when connected (success path)', async () => {
  const { handler, db, redis } = setup();
  // Simulate Redis connected — make pushResult return true and count
  redis.connected = true;
  let redisCount = 0;
  redis.pushResult = async () => { redisCount++; return true; };
  await handler('t1', {
    type: 'result',
    result: {
      url: 'https://example.com/redis',
      foundOn: 'https://x',
      linkType: 'a',
      isExternal: true,
      depth: 1,
      pageTitle: '',
      statusCode: 0,
    },
  });
  // Should NOT have written to SQLite (Redis succeeded)
  const row = db.prepare('SELECT * FROM results WHERE url = ?').get('https://example.com/redis');
  assert.equal(row, undefined, 'no SQLite write when Redis succeeds');
  assert.equal(redisCount, 1);
});

// 'result_title' message: page title / status code update path
test('handler: result_title message updates existing result row', async () => {
  const { handler, db } = setup();
  await insertResult(handler, 't1', 'https://x.com/page');
  await handler('t1', {
    type: 'result_title',
    url: 'https://x.com/page',
    pageTitle: 'My Page Title',
    statusCode: 200,
  });
  const row = db.prepare('SELECT page_title, status_code FROM results WHERE url = ?').get('https://x.com/page');
  assert.equal(row.page_title, 'My Page Title');
  assert.equal(row.status_code, 200);
});

test('handler: result_title broadcasts to WS clients', async () => {
  const { handler, broadcast } = setup();
  await insertResult(handler, 't1', 'https://x.com/page');
  broadcast.sent.length = 0;
  await handler('t1', {
    type: 'result_title',
    url: 'https://x.com/page',
    pageTitle: 'Title',
    statusCode: 200,
  });
  const found = broadcast.sent.find(s => s.msg.type === 'result_title');
  assert.ok(found);
  assert.equal(found.msg.pageTitle, 'Title');
  assert.equal(found.msg.statusCode, 200);
});

test('handler: result_title with missing result row is safe no-op', async () => {
  const { handler, db } = setup();
  // No insertResult — race scenario
  await handler('t1', {
    type: 'result_title',
    url: 'https://nonexistent.com/',
    pageTitle: 'Title',
    statusCode: 200,
  });
  // No crash, no rows
  const row = db.prepare('SELECT * FROM results WHERE url = ?').get('https://nonexistent.com/');
  assert.equal(row, undefined);
});

// 'status' message: task status update + terminal Redis flush
test('handler: status message updates task status in DB', async () => {
  const { handler, db, queries } = setup();
  await handler('t1', { type: 'status', status: 'running' });
  const task = queries.getTask('t1');
  assert.equal(task.status, 'running');
});

test('handler: terminal status (completed) calls redis.flushToSQLite', async () => {
  const { handler, redis } = setup();
  redis.flushToSQLite = async () => { redis.flushed = (redis.flushed || 0) + 1; return 0; };
  await handler('t1', { type: 'status', status: 'completed' });
  assert.equal(redis.flushed, 1, 'flushToSQLite should be called once for completed status');
});

test('handler: terminal status (error) also flushes Redis', async () => {
  const { handler, redis } = setup();
  redis.flushToSQLite = async () => { redis.flushed = (redis.flushed || 0) + 1; return 0; };
  await handler('t1', { type: 'status', status: 'error' });
  assert.equal(redis.flushed, 1);
});

test('handler: terminal status (cancelled) also flushes Redis', async () => {
  const { handler, redis } = setup();
  redis.flushToSQLite = async () => { redis.flushed = (redis.flushed || 0) + 1; return 0; };
  await handler('t1', { type: 'status', status: 'cancelled' });
  assert.equal(redis.flushed, 1);
});

test('handler: non-terminal status (running/paused) does NOT flush Redis', async () => {
  const { handler, redis } = setup();
  redis.flushToSQLite = async () => { redis.flushed = (redis.flushed || 0) + 1; return 0; };
  await handler('t1', { type: 'status', status: 'running' });
  await handler('t1', { type: 'status', status: 'paused' });
  assert.equal(redis.flushed, undefined, 'flushToSQLite should not be called for non-terminal status');
});

test('handler: status message broadcasts to WS clients', async () => {
  const { handler, broadcast } = setup();
  broadcast.sent.length = 0;
  await handler('t1', { type: 'status', status: 'running' });
  const found = broadcast.sent.find(s => s.msg.type === 'status');
  assert.ok(found);
  assert.equal(found.msg.status, 'running');
});
