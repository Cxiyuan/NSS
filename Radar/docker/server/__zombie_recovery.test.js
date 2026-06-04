// Zombie task recovery tests — v1.2 fix: 9.2.11.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { initDB } from './db/schema.js';
import { createQueries } from './db/queries.js';
import { recoverZombieTasks } from './utils/zombie-recovery.js';

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

test('recoverZombieTasks: marks running task as error + records reason', () => {
  const { db, queries } = freshDb();
  queries.createTask({ id: 't1', type: 'url_crawl', config: { url: 'https://x' } });
  queries.updateTaskStatus('t1', 'running');
  const recovered = recoverZombieTasks(db, queries);
  assert.equal(recovered, 1);
  const task = queries.getTask('t1');
  assert.equal(task.status, 'error');
  assert.ok(task.config.error_message.includes('Server restarted'));
});

test('recoverZombieTasks: marks paused task as error', () => {
  const { db, queries } = freshDb();
  queries.createTask({ id: 't1', type: 'url_crawl', config: { url: 'https://x' } });
  queries.updateTaskStatus('t1', 'paused');
  const recovered = recoverZombieTasks(db, queries);
  assert.equal(recovered, 1);
  const task = queries.getTask('t1');
  assert.equal(task.status, 'error');
});

test('recoverZombieTasks: does NOT touch completed tasks', () => {
  const { db, queries } = freshDb();
  queries.createTask({ id: 't1', type: 'url_crawl', config: { url: 'https://x' } });
  queries.updateTaskStatus('t1', 'completed');
  const recovered = recoverZombieTasks(db, queries);
  assert.equal(recovered, 0);
  const task = queries.getTask('t1');
  assert.equal(task.status, 'completed');
});

test('recoverZombieTasks: does NOT touch pending tasks', () => {
  const { db, queries } = freshDb();
  queries.createTask({ id: 't1', type: 'url_crawl', config: { url: 'https://x' } });
  // Newly created task is in 'pending' state
  const recovered = recoverZombieTasks(db, queries);
  assert.equal(recovered, 0);
  const task = queries.getTask('t1');
  assert.equal(task.status, 'pending');
});

test('recoverZombieTasks: handles multiple zombie tasks', () => {
  const { db, queries } = freshDb();
  for (let i = 1; i <= 5; i++) {
    queries.createTask({ id: `t${i}`, type: 'url_crawl', config: { url: 'https://x' } });
    queries.updateTaskStatus(`t${i}`, i % 2 === 0 ? 'paused' : 'running');
  }
  const recovered = recoverZombieTasks(db, queries);
  assert.equal(recovered, 5);
  for (let i = 1; i <= 5; i++) {
    const task = queries.getTask(`t${i}`);
    assert.equal(task.status, 'error');
    assert.ok(task.config.error_message);
  }
});

test('recoverZombieTasks: returns 0 when DB is empty', () => {
  const { db, queries } = freshDb();
  const recovered = recoverZombieTasks(db, queries);
  assert.equal(recovered, 0);
});

test('recoverZombieTasks: preserves original config (only adds error_message)', () => {
  const { db, queries } = freshDb();
  queries.createTask({
    id: 't1',
    type: 'keyword_search',
    config: { keywords: 'test', depth: 3, customField: 'preserved' },
  });
  queries.updateTaskStatus('t1', 'running');
  recoverZombieTasks(db, queries);
  const task = queries.getTask('t1');
  assert.equal(task.config.keywords, 'test');
  assert.equal(task.config.depth, 3);
  assert.equal(task.config.customField, 'preserved');
  assert.ok(task.config.error_message);
});
