// Unit tests for F-1 fix: result_tags persistence.
// Uses Node 22+ built-in `node:sqlite` (no external deps), so runs locally
// without `npm install`. This is a white-box test of the SQL behavior of
// `updateResultRisk`; CI runs the full better-sqlite3 path.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { unlinkSync, mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const TEST_DB = './data/test-risk-persist-node.db';
// v1.2 fix: 9.2.10 — node:sqlite does NOT create parent directories. Without
// this, a fresh `git clone && npm test` crashes with "unable to open database
// file" because the data/ folder is gitignored and missing.
before(() => { mkdirSync('./data', { recursive: true }); });

describe('Risk persistence — SQL behavior (F-1 fix)', () => {
  let db, taskId;

  before(() => {
    try { unlinkSync(TEST_DB); } catch {}
    db = new DatabaseSync(TEST_DB);
    db.exec(`
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        config TEXT NOT NULL,
        stats TEXT DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        found_on TEXT NOT NULL,
        link_type TEXT NOT NULL,
        is_external INTEGER DEFAULT 0,
        depth INTEGER DEFAULT 0,
        page_title TEXT,
        status_code INTEGER DEFAULT 0,
        snippet TEXT,
        risk_level TEXT DEFAULT 'clean',
        risk_tags TEXT DEFAULT '',
        icp TEXT DEFAULT '',
        created_at TEXT NOT NULL
      );
    `);
    db.prepare(
      "INSERT INTO tasks (id, type, config, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    ).run('t1', 'url_crawl', '{}', '2026-01-01', '2026-01-01');
    taskId = 't1';
    db.prepare(
      'INSERT INTO results (task_id, url, found_on, link_type, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(taskId, 'https://spam.tk/ad', 'https://seed.com', 'a', '2026-01-01');
    db.prepare(
      'INSERT INTO results (task_id, url, found_on, link_type, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(taskId, 'https://normal.com', 'https://seed.com', 'a', '2026-01-01');
  });

  after(() => {
    db?.close();
    try { unlinkSync(TEST_DB); } catch {}
  });

  it('UPDATE persists risk_level + risk_tags + icp for existing result', () => {
    db.prepare(
      'UPDATE results SET risk_level = ?, risk_tags = ?, icp = ? WHERE task_id = ? AND url = ?'
    ).run('illegal', 'porn:3,free-tld', '', taskId, 'https://spam.tk/ad');
    const row = db.prepare('SELECT risk_level, risk_tags, icp FROM results WHERE task_id = ? AND url = ?')
      .get(taskId, 'https://spam.tk/ad');
    assert.strictEqual(row.risk_level, 'illegal');
    assert.strictEqual(row.risk_tags, 'porn:3,free-tld');
    assert.strictEqual(row.icp, '');
  });

  it('UPDATE is safe no-op when result row does not exist (race with INSERT)', () => {
    const info = db.prepare(
      'UPDATE results SET risk_level = ? WHERE task_id = ? AND url = ?'
    ).run('illegal', taskId, 'https://nonexistent.com');
    assert.strictEqual(info.changes, 0);
  });

  it('overwrites previous risk (last write wins) — matches "tags re-evaluated" model', () => {
    db.prepare('UPDATE results SET risk_level = ?, risk_tags = ? WHERE task_id = ? AND url = ?')
      .run('suspicious', 'free-tld', taskId, 'https://normal.com');
    db.prepare('UPDATE results SET risk_level = ?, risk_tags = ? WHERE task_id = ? AND url = ?')
      .run('clean', '', taskId, 'https://normal.com');
    const row = db.prepare('SELECT risk_level, risk_tags FROM results WHERE url = ?')
      .get('https://normal.com');
    assert.strictEqual(row.risk_level, 'clean');
    assert.strictEqual(row.risk_tags, '');
  });

  it('persists ICP string verbatim (preserves CJK chars, hyphens, digits)', () => {
    db.prepare('UPDATE results SET icp = ? WHERE task_id = ? AND url = ?')
      .run('京ICP备12345678号-1', taskId, 'https://spam.tk/ad');
    const row = db.prepare('SELECT icp FROM results WHERE url = ?').get('https://spam.tk/ad');
    assert.strictEqual(row.icp, '京ICP备12345678号-1');
  });

  it('default risk columns on INSERT (schema defaults)', () => {
    // Use a fresh task to isolate this test from prior inserts.
    db.prepare(
      "INSERT INTO tasks (id, type, config, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    ).run('t-untouched', 'url_crawl', '{}', '2026-01-01', '2026-01-01');
    db.prepare('INSERT INTO results (task_id, url, found_on, link_type, created_at) VALUES (?, ?, ?, ?, ?)')
      .run('t-untouched', 'https://untouched.com', 'https://seed.com', 'a', '2026-01-01');
    const row = db.prepare('SELECT risk_level, risk_tags, icp FROM results WHERE url = ?')
      .get('https://untouched.com');
    assert.strictEqual(row.risk_level, 'clean');
    assert.strictEqual(row.risk_tags, '');
    assert.strictEqual(row.icp, '');
  });

  it('TEXT column accepts all 4 documented risk values (no CHECK constraint)', () => {
    for (const v of ['clean', 'suspicious', 'illegal', 'blackhat']) {
      db.prepare('UPDATE results SET risk_level = ? WHERE task_id = ? AND url = ?')
        .run(v, taskId, 'https://spam.tk/ad');
    }
    const row = db.prepare('SELECT risk_level FROM results WHERE url = ?')
      .get('https://spam.tk/ad');
    // Validates the contract detector.js + index.js rely on (4 specific strings).
    assert.ok(['clean', 'suspicious', 'illegal', 'blackhat'].includes(row.risk_level));
  });

  it('SELECT surfaces risk columns in JOIN-like result query', () => {
    // Simulates what routes/results.js getResults does
    db.prepare('UPDATE results SET risk_level = ?, risk_tags = ?, icp = ? WHERE task_id = ? AND url = ?')
      .run('illegal', 'porn:3,free-tld', '京ICPxxx号', taskId, 'https://spam.tk/ad');
    db.prepare('UPDATE results SET risk_level = ?, risk_tags = ?, icp = ? WHERE task_id = ? AND url = ?')
      .run('clean', '', '京ICPyyy号', taskId, 'https://normal.com');
    const rows = db.prepare(
      'SELECT url, risk_level, risk_tags, icp FROM results WHERE task_id = ? ORDER BY id ASC'
    ).all(taskId);
    assert.strictEqual(rows.length, 2);
    assert.strictEqual(rows[0].url, 'https://spam.tk/ad');
    assert.strictEqual(rows[0].risk_level, 'illegal');
    assert.strictEqual(rows[0].risk_tags, 'porn:3,free-tld');
    assert.strictEqual(rows[0].icp, '京ICPxxx号');
    assert.strictEqual(rows[1].url, 'https://normal.com');
    assert.strictEqual(rows[1].risk_level, 'clean');
    assert.strictEqual(rows[1].icp, '京ICPyyy号');
  });
});
