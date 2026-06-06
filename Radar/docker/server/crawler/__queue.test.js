// CrawlQueue unit tests — v1.2.QA Sprint 1 (extracted from worker.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { CrawlQueue } from './queue.js';

test('CrawlQueue: enqueue returns true on success', () => {
  const q = new CrawlQueue();
  assert.equal(q.enqueue('https://a.com', 0), true);
  assert.equal(q.size, 1);
  assert.equal(q.visitedCount, 1);
});

test('CrawlQueue: enqueue returns false on duplicate', () => {
  const q = new CrawlQueue();
  q.enqueue('https://a.com', 0);
  assert.equal(q.enqueue('https://a.com', 0), false);
  assert.equal(q.size, 1);  // not added again
});

test('CrawlQueue: enqueue returns false on invalid input', () => {
  const q = new CrawlQueue();
  assert.equal(q.enqueue(null, 0), false);
  assert.equal(q.enqueue(undefined, 0), false);
  assert.equal(q.enqueue('', 0), false);
  assert.equal(q.enqueue(123, 0), false);  // not a string
  assert.equal(q.size, 0);
});

test('CrawlQueue: take returns FIFO batch', () => {
  const q = new CrawlQueue();
  q.enqueue('https://a.com', 0);
  q.enqueue('https://b.com', 1);
  q.enqueue('https://c.com', 2);
  const batch = q.take(2);
  assert.equal(batch.length, 2);
  assert.equal(batch[0].url, 'https://a.com');
  assert.equal(batch[0].depth, 0);
  assert.equal(batch[1].url, 'https://b.com');
  assert.equal(q.size, 1);
  assert.equal(q.visitedCount, 3);  // all 3 still in visited
});

test('CrawlQueue: take with count > size returns all', () => {
  const q = new CrawlQueue();
  q.enqueue('https://a.com', 0);
  const batch = q.take(5);
  assert.equal(batch.length, 1);
  assert.equal(q.size, 0);
});

test('CrawlQueue: take on empty queue returns []', () => {
  const q = new CrawlQueue();
  assert.deepEqual(q.take(5), []);
});

test('CrawlQueue: has() checks visited set', () => {
  const q = new CrawlQueue();
  q.enqueue('https://a.com', 0);
  assert.equal(q.has('https://a.com'), true);
  assert.equal(q.has('https://b.com'), false);
});

test('CrawlQueue: cancel() prevents further enqueue/take', () => {
  const q = new CrawlQueue();
  q.enqueue('https://a.com', 0);
  q.cancel();
  assert.equal(q.isCancelled, true);
  assert.equal(q.enqueue('https://b.com', 0), false);
  assert.deepEqual(q.take(5), []);  // empty because cancelled
});

test('CrawlQueue: take respects cancel flag mid-drain', () => {
  const q = new CrawlQueue();
  q.enqueue('https://a.com', 0);
  q.enqueue('https://b.com', 0);
  const first = q.take(1);
  assert.equal(first.length, 1);
  q.cancel();
  // After cancel, even though queue has b.com, take returns []
  const second = q.take(5);
  assert.deepEqual(second, []);
});

test('CrawlQueue: reset() clears state for new task', () => {
  const q = new CrawlQueue();
  q.enqueue('https://a.com', 0);
  q.enqueue('https://b.com', 0);
  q.cancel();
  q.reset();
  assert.equal(q.size, 0);
  assert.equal(q.visitedCount, 0);
  assert.equal(q.isCancelled, false);
  // Should accept enqueue again
  assert.equal(q.enqueue('https://c.com', 0), true);
});

test('CrawlQueue: foundOn tracked correctly', () => {
  const q = new CrawlQueue();
  q.enqueue('https://a.com', 1, 'https://seed.com');
  const batch = q.take(1);
  assert.equal(batch[0].foundOn, 'https://seed.com');
});

test('CrawlQueue: high-volume stress (1000 URLs, dedup)', () => {
  const q = new CrawlQueue();
  for (let i = 0; i < 1000; i++) {
    q.enqueue(`https://a.com/${i}`, i % 5);
  }
  // All unique, all should be in queue
  assert.equal(q.size, 1000);
  // Add 1000 duplicates
  for (let i = 0; i < 1000; i++) {
    q.enqueue(`https://a.com/${i}`, 0);
  }
  // Still 1000 (deduped)
  assert.equal(q.size, 1000);
  assert.equal(q.visitedCount, 1000);
  // Drain in batches
  let drained = 0;
  while (q.size > 0) {
    const b = q.take(50);
    drained += b.length;
  }
  assert.equal(drained, 1000);
});
