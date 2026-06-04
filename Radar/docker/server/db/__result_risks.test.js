// result_risks normalized table — schema migration, dual-write integrity,
// and aggregation query correctness (v1.2 P2-1).
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { initDB } from '../db/schema.js';
import { createQueries } from '../db/queries.js';

function installPragmaShim(db) {
  db.pragma = function (sql) {
    if (/=/.test(sql)) { db.exec(`PRAGMA ${sql}`); return []; }
    return db.prepare(`PRAGMA ${sql}`).all();
  };
}

function freshDb() {
  const db = new DatabaseSync(':memory:');
  installPragmaShim(db);
  initDB(db);
  return { db, queries: createQueries(db) };
}

// ─── Schema migration ──────────────────────────────────────────────────
test('result_risks table created with 10 columns (id + 9 data)', () => {
  const { db } = freshDb();
  const cols = db.prepare('PRAGMA table_info(result_risks)').all().map(c => c.name);
  assert.deepEqual(cols.sort(), [
    'category', 'confidence', 'detail', 'detected_at',
    'icp', 'id', 'level', 'result_id', 'source', 'task_id', 'url',
  ]);
});

test('result_risks has UNIQUE (result_id, category) constraint', () => {
  const { db } = freshDb();
  const indexes = db.prepare('PRAGMA index_list(result_risks)').all();
  const unique = indexes.filter(i => /UNIQUE/.test(i.origin || '') || /unique/i.test(i.name));
  const uniqueName = unique.find(i => i.name === 'idx_risks_unique');
  assert.ok(uniqueName, 'idx_risks_unique index missing');
});

test('result_risks CHECK constraint rejects invalid level', () => {
  const { db, queries } = freshDb();
  queries.createTask({ id: 't1', type: 'url_crawl', config: { url: 'https://x' } });
  queries.insertResult('t1', { url: 'https://a.com', foundOn: 'https://x', linkType: 'a', isExternal: true, depth: 1, pageTitle: '', statusCode: 0, snippet: '' });
  // 'extreme' is not in CHECK constraint
  assert.throws(() => {
    db.prepare(
      `INSERT INTO result_risks (result_id, task_id, url, category, level, detected_at)
       VALUES (1, 't1', 'https://a.com', 'porn', 'extreme', '2026-01-01')`
    ).run();
  }, /CHECK/);
});

test('result_risks CHECK constraint rejects invalid source', () => {
  const { db, queries } = freshDb();
  queries.createTask({ id: 't1', type: 'url_crawl', config: { url: 'https://x' } });
  queries.insertResult('t1', { url: 'https://a.com', foundOn: 'https://x', linkType: 'a', isExternal: true, depth: 1, pageTitle: '', statusCode: 0, snippet: '' });
  // 'unknown' is not in CHECK constraint
  assert.throws(() => {
    db.prepare(
      `INSERT INTO result_risks (result_id, task_id, url, category, level, source, detected_at)
       VALUES (1, 't1', 'https://a.com', 'porn', 'illegal', 'unknown', '2026-01-01')`
    ).run();
  }, /CHECK/);
});

// ─── Dual-write: updateResultRisk populates result_risks ───────────────
test('updateResultRisk populates result_risks with one row per category', () => {
  const { db, queries } = freshDb();
  queries.createTask({ id: 't1', type: 'url_crawl', config: { url: 'https://x' } });
  queries.insertResult('t1', { url: 'https://spam.tk/page', foundOn: 'https://x', linkType: 'a', isExternal: true, depth: 1, pageTitle: '', statusCode: 0, snippet: '' });
  queries.updateResultRisk('t1', 'https://spam.tk/page', 'illegal', 'porn:2,free-tld,gambling:1', '');
  const rows = db.prepare('SELECT category, level, detail, source FROM result_risks WHERE url = ? ORDER BY category').all('https://spam.tk/page');
  // Expect: 3 tag rows + 1 no-icp row = 4 rows total
  assert.equal(rows.length, 4);
  // tag rows
  assert.ok(rows.find(r => r.category === 'porn' && r.level === 'illegal' && r.detail === '2' && r.source === 'worker'));
  assert.ok(rows.find(r => r.category === 'free-tld' && r.level === 'illegal' && r.detail === ''));
  assert.ok(rows.find(r => r.category === 'gambling' && r.level === 'illegal' && r.detail === '1'));
  // synthetic no-icp row (since icp was empty)
  assert.ok(rows.find(r => r.category === 'no-icp' && r.level === 'clean' && r.detail === ''));
});

test('updateResultRisk writes has-icp row when ICP present', () => {
  const { db, queries } = freshDb();
  queries.createTask({ id: 't1', type: 'url_crawl', config: { url: 'https://x' } });
  queries.insertResult('t1', { url: 'https://acme.cn', foundOn: 'https://x', linkType: 'a', isExternal: true, depth: 1, pageTitle: '', statusCode: 0, snippet: '' });
  queries.updateResultRisk('t1', 'https://acme.cn', 'suspicious', 'free-tld:1', '京ICP备12345678号');
  const rows = db.prepare('SELECT category, icp FROM result_risks WHERE url = ?').all('https://acme.cn');
  assert.equal(rows.length, 2);  // free-tld + has-icp
  assert.ok(rows.find(r => r.category === 'has-icp' && r.icp === '京ICP备12345678号'));
});

test('updateResultRisk is INSERT OR IGNORE — re-detection does not duplicate', () => {
  const { db, queries } = freshDb();
  queries.createTask({ id: 't1', type: 'url_crawl', config: { url: 'https://x' } });
  queries.insertResult('t1', { url: 'https://a.com', foundOn: 'https://x', linkType: 'a', isExternal: true, depth: 1, pageTitle: '', statusCode: 0, snippet: '' });
  queries.updateResultRisk('t1', 'https://a.com', 'illegal', 'porn:1', '');
  queries.updateResultRisk('t1', 'https://a.com', 'illegal', 'porn:1', '');  // re-emit
  const rows = db.prepare('SELECT COUNT(*) as c FROM result_risks WHERE url = ? AND category = ?').get('https://a.com', 'porn');
  assert.equal(rows.c, 1);
});

test('updateResultRisk is safe no-op when result row does not exist (race)', () => {
  const { db, queries } = freshDb();
  // No insertResult — simulate tags arriving before result row
  queries.updateResultRisk('t1', 'https://a.com', 'illegal', 'porn:1', '');
  // No error, no rows in result_risks (since result_id is unknown)
  const rows = db.prepare('SELECT * FROM result_risks').all();
  assert.equal(rows.length, 0);
});

test('updateResultRisk preserves blacklink tag with detailed evidence', () => {
  const { db, queries } = freshDb();
  queries.createTask({ id: 't1', type: 'url_crawl', config: { url: 'https://x' } });
  queries.insertResult('t1', { url: 'https://spam.cn/x', foundOn: 'https://x', linkType: 'a', isExternal: true, depth: 1, pageTitle: '', statusCode: 0, snippet: '' });
  queries.updateResultRisk('t1', 'https://spam.cn/x', 'illegal', 'blacklink:1:css-hide:display:none', '');
  const row = db.prepare("SELECT category, level, detail FROM result_risks WHERE category = 'blacklink'").get();
  assert.equal(row.category, 'blacklink');
  assert.equal(row.level, 'illegal');
  // Detail should capture the count + evidence (after the first colon)
  assert.equal(row.detail, '1:css-hide:display:none');
});

// ─── Aggregation: getRiskSummary ────────────────────────────────────────
test('getRiskSummary returns correct category counts', () => {
  const { queries } = freshDb();
  queries.createTask({ id: 't1', type: 'url_crawl', config: { url: 'https://x' } });
  queries.insertResult('t1', { url: 'https://a.com', foundOn: 'https://x', linkType: 'a', isExternal: true, depth: 1, pageTitle: '', statusCode: 0, snippet: '' });
  queries.insertResult('t1', { url: 'https://b.com', foundOn: 'https://x', linkType: 'a', isExternal: true, depth: 1, pageTitle: '', statusCode: 0, snippet: '' });
  queries.updateResultRisk('t1', 'https://a.com', 'illegal', 'porn:2,gambling:1', '');
  queries.updateResultRisk('t1', 'https://b.com', 'suspicious', 'free-tld:1', '京ICP备12345678号');
  const summary = queries.getRiskSummary('t1');
  // Rows: a.com=3 (porn+gambling+no-icp), b.com=2 (free-tld+has-icp) = 5
  assert.equal(summary.total, 5);
  assert.equal(summary.byCategory.porn, 1);
  assert.equal(summary.byCategory.gambling, 1);
  assert.equal(summary.byCategory.free_tld, undefined);  // 'free-tld' is the actual key
  assert.equal(summary.byCategory['free-tld'], 1);
  assert.equal(summary.byCategory['no-icp'], 1);
  assert.equal(summary.byCategory['has-icp'], 1);
});

test('getRiskSummary returns level distribution', () => {
  const { queries } = freshDb();
  queries.createTask({ id: 't1', type: 'url_crawl', config: { url: 'https://x' } });
  queries.insertResult('t1', { url: 'https://a.com', foundOn: 'https://x', linkType: 'a', isExternal: true, depth: 1, pageTitle: '', statusCode: 0, snippet: '' });
  queries.updateResultRisk('t1', 'https://a.com', 'illegal', 'porn:1', '');
  const summary = queries.getRiskSummary('t1');
  // 1 illegal tag row + 1 clean no-icp row
  assert.equal(summary.byLevel.illegal, 1);
  assert.equal(summary.byLevel.clean, 1);
});

test('getRiskSummary returns ICP coverage rate', () => {
  const { queries } = freshDb();
  queries.createTask({ id: 't1', type: 'url_crawl', config: { url: 'https://x' } });
  queries.insertResult('t1', { url: 'https://a.com', foundOn: 'https://x', linkType: 'a', isExternal: true, depth: 1, pageTitle: '', statusCode: 0, snippet: '' });
  queries.insertResult('t1', { url: 'https://b.com', foundOn: 'https://x', linkType: 'a', isExternal: true, depth: 1, pageTitle: '', statusCode: 0, snippet: '' });
  queries.updateResultRisk('t1', 'https://a.com', 'clean', '', '京ICP备12345678号');
  queries.updateResultRisk('t1', 'https://b.com', 'clean', '', '');
  const summary = queries.getRiskSummary('t1');
  assert.equal(summary.icpCoverage.with, 1);
  assert.equal(summary.icpCoverage.without, 1);
  assert.equal(summary.icpCoverage.rate, 0.5);
});

test('getRiskSummary returns empty summary for unknown task', () => {
  const { queries } = freshDb();
  const summary = queries.getRiskSummary('nonexistent');
  assert.equal(summary.total, 0);
  assert.deepEqual(summary.byCategory, {});
  assert.deepEqual(summary.byLevel, {});
  assert.equal(summary.icpCoverage.rate, 0);
});

// ─── Aggregation: getRisksByCategory / getRisksByLevel ─────────────────
test('getRisksByCategory returns rows for a given category', () => {
  const { queries } = freshDb();
  queries.createTask({ id: 't1', type: 'url_crawl', config: { url: 'https://x' } });
  queries.insertResult('t1', { url: 'https://a.com', foundOn: 'https://x', linkType: 'a', isExternal: true, depth: 1, pageTitle: '', statusCode: 0, snippet: '' });
  queries.insertResult('t1', { url: 'https://b.com', foundOn: 'https://x', linkType: 'a', isExternal: true, depth: 1, pageTitle: '', statusCode: 0, snippet: '' });
  queries.updateResultRisk('t1', 'https://a.com', 'illegal', 'porn:1', '');
  queries.updateResultRisk('t1', 'https://b.com', 'illegal', 'porn:1', '');
  const pornRows = queries.getRisksByCategory('t1', 'porn');
  assert.equal(pornRows.length, 2);
  assert.ok(pornRows.every(r => r.category === 'porn' && r.level === 'illegal'));
});

test('getRisksByLevel returns URLs grouped with worst level', () => {
  const { queries } = freshDb();
  queries.createTask({ id: 't1', type: 'url_crawl', config: { url: 'https://x' } });
  queries.insertResult('t1', { url: 'https://a.com', foundOn: 'https://x', linkType: 'a', isExternal: true, depth: 1, pageTitle: '', statusCode: 0, snippet: '' });
  queries.insertResult('t1', { url: 'https://b.com', foundOn: 'https://x', linkType: 'a', isExternal: true, depth: 1, pageTitle: '', statusCode: 0, snippet: '' });
  queries.updateResultRisk('t1', 'https://a.com', 'illegal', 'porn:1,gambling:1', '');
  queries.updateResultRisk('t1', 'https://b.com', 'illegal', 'porn:1', '');
  const illegalUrls = queries.getRisksByLevel('t1', 'illegal');
  assert.equal(illegalUrls.length, 2);
  // a.com has 3 illegal rows (porn + gambling + no-icp) — wait, no-icp is level=clean
  // actually only porn + gambling are level=illegal, so 2 illegal tag rows
  // grouped by url → 2 rows total
  const a = illegalUrls.find(u => u.url === 'https://a.com');
  assert.equal(a.tag_count, 2);
});

// ─── ON DELETE CASCADE: deleting result removes its risk rows ──────────
test('ON DELETE CASCADE: deleting a result removes its result_risks rows', () => {
  const { db, queries } = freshDb();
  queries.createTask({ id: 't1', type: 'url_crawl', config: { url: 'https://x' } });
  queries.insertResult('t1', { url: 'https://a.com', foundOn: 'https://x', linkType: 'a', isExternal: true, depth: 1, pageTitle: '', statusCode: 0, snippet: '' });
  queries.updateResultRisk('t1', 'https://a.com', 'illegal', 'porn:1', '');
  assert.equal(db.prepare('SELECT COUNT(*) as c FROM result_risks').get().c, 2);
  // Delete the task (CASCADEs to results, then to result_risks)
  queries.deleteTask('t1');
  assert.equal(db.prepare('SELECT COUNT(*) as c FROM result_risks').get().c, 0);
});
