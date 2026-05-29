import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import Database from 'better-sqlite3';
import { initDB } from './schema.js';
import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';

const TEST_DB = './data/test.db';

describe('schema', () => {
  let db;

  before(() => {
    const dir = dirname(TEST_DB);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    try { unlinkSync(TEST_DB); } catch {}
    db = new Database(TEST_DB);
  });

  after(() => {
    db.close();
    try { unlinkSync(TEST_DB); } catch {}
  });

  it('creates tasks table with expected columns', () => {
    initDB(db);
    const cols = db.prepare("PRAGMA table_info(tasks)").all().map(c => c.name);
    ['id', 'type', 'status', 'config', 'stats', 'created_at', 'updated_at'].forEach(c => {
      assert.ok(cols.includes(c), `tasks table missing column: ${c}`);
    });
  });

  it('creates results table with expected columns', () => {
    initDB(db);
    const cols = db.prepare("PRAGMA table_info(results)").all().map(c => c.name);
    ['id', 'task_id', 'url', 'found_on', 'link_type', 'is_external', 'depth', 'page_title', 'snippet', 'created_at'].forEach(c => {
      assert.ok(cols.includes(c), `results table missing column: ${c}`);
    });
  });

  it('creates indexes on results', () => {
    initDB(db);
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='results'").all().map(i => i.name);
    assert.ok(indexes.some(i => i.includes('task')), 'missing task_id index');
    assert.ok(indexes.some(i => i.includes('external')), 'missing external index');
  });

  it('foreign key cascade deletes results when task is deleted', () => {
    initDB(db);
    db.prepare("INSERT INTO tasks (id, type, status, config, created_at, updated_at) VALUES (?,?,?,?,?,?)")
      .run('t1', 'url_crawl', 'running', '{}', new Date().toISOString(), new Date().toISOString());
    db.prepare("INSERT INTO results (task_id, url, found_on, link_type, created_at) VALUES (?,?,?,?,?)")
      .run('t1', 'https://a.com', 'https://seed.com', 'a', new Date().toISOString());
    db.prepare("DELETE FROM tasks WHERE id = ?").run('t1');
    const remaining = db.prepare("SELECT COUNT(*) as c FROM results WHERE task_id = ?").get('t1');
    assert.strictEqual(remaining.c, 0);
  });
});
