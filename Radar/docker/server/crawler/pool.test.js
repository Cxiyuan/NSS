import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { WorkerPool } from './pool.js';

describe('WorkerPool', () => {
  let pool;
  const receivedMessages = [];

  before(() => {
    // Create pool with max 2 workers, capturing messages
    pool = new WorkerPool(2, (taskId, msg) => {
      receivedMessages.push({ taskId, msg });
    });
  });

  after(() => {
    // Clean up any remaining workers
    for (const taskId of ['test-task-1', 'test-task-2', 'test-task-3']) {
      try { pool.cancelTask(taskId); } catch {}
    }
  });

  describe('startTask', () => {
    it('starts a task and returns worker reference', () => {
      const worker = pool.startTask('test-task-1', { taskId: 'test-task-1', type: 'url_crawl', url: 'https://example.com', depth: 1, concurrency: 1 });
      assert.ok(worker !== null);
      assert.strictEqual(pool.activeWorkers, 1);
    });

    it('starts second task when under maxWorkers', () => {
      const worker = pool.startTask('test-task-2', { taskId: 'test-task-2', type: 'url_crawl', url: 'https://other.com', depth: 1, concurrency: 1 });
      assert.ok(worker !== null);
      assert.strictEqual(pool.activeWorkers, 2);
    });

    it('returns null when pool is at capacity', () => {
      const worker = pool.startTask('test-task-3', { taskId: 'test-task-3', type: 'url_crawl', url: 'https://overflow.com', depth: 1, concurrency: 1 });
      assert.strictEqual(worker, null);
      assert.strictEqual(pool.activeWorkers, 2);
    });
  });

  describe('isTaskRunning', () => {
    it('returns true for running task', () => {
      assert.ok(pool.isTaskRunning('test-task-1'));
    });

    it('returns false for unknown task', () => {
      assert.strictEqual(pool.isTaskRunning('nonexistent'), false);
    });
  });

  describe('pause / resume', () => {
    it('does not throw when pausing a known task', () => {
      // pause is fire-and-forget via postMessage; just check no exception
      pool.pauseTask('test-task-1');
    });

    it('does not throw when resuming a known task', () => {
      pool.resumeTask('test-task-1');
    });

    it('does not throw for unknown taskId', () => {
      pool.pauseTask('nonexistent');
      pool.resumeTask('nonexistent');
    });
  });

  describe('cancelTask', () => {
    it('cancels a running task', () => {
      pool.cancelTask('test-task-1');
      // Give it a moment to process
    });

    it('decrements activeWorkers on exit', async () => {
      pool.cancelTask('test-task-2');
      // Wait for worker termination
      await new Promise(r => setTimeout(r, 200));
      assert.strictEqual(pool.activeWorkers, 0);
    });
  });
});
