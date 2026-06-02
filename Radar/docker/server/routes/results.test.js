import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import express from 'express';
import Database from 'better-sqlite3';
import { initDB } from '../db/schema.js';
import { createQueries } from '../db/queries.js';
import { createTaskRoutes } from './tasks.js';
import { createResultRoutes } from './results.js';
import { unlinkSync } from 'node:fs';
import http from 'node:http';

const TEST_DB = './data/test-results.db';

function jsonRequest(url, method, body) {
  return new Promise((resolve, reject) => {
    const { hostname, port, pathname, search } = new URL(url);
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname, port, path: pathname + (search || ''), method,
      headers: { 'Content-Type': 'application/json' },
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, body }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

describe('Results API', () => {
  let server, db, queries, baseUrl;
  let taskId;

  before(async () => {
    try { unlinkSync(TEST_DB); } catch {}
    db = new Database(TEST_DB);
    initDB(db);
    queries = createQueries(db);

    const app = express();
    app.use(express.json());
    app.use('/api/tasks', createTaskRoutes(queries, null)); // pool=null so no worker spawn
    app.use('/api/tasks', createResultRoutes(queries));

    await new Promise(resolve => {
      server = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });

    // Seed a task with some results
    const create = await jsonRequest(`${baseUrl}/api/tasks`, 'POST', {
      type: 'url_crawl', url: 'https://seed.com', depth: 1, concurrency: 1, filters: [],
    });
    taskId = create.body.id;

    queries.insertResult(taskId, { url: 'https://ext1.com', foundOn: 'https://seed.com', linkType: 'a', isExternal: true, depth: 1 });
    queries.insertResult(taskId, { url: 'https://ext2.com/page', foundOn: 'https://seed.com', linkType: 'script', isExternal: true, depth: 2 });
    queries.insertResult(taskId, { url: 'https://ext1.com', foundOn: 'https://other.com', linkType: 'img', isExternal: true, depth: 1 });
    queries.insertResult(taskId, { url: 'https://internal.com', foundOn: 'https://seed.com', linkType: 'a', isExternal: false, depth: 0 });
  });

  after(() => {
    server?.close();
    db?.close();
    try { unlinkSync(TEST_DB); } catch {}
  });

  describe('GET /api/tasks/:id/results', () => {
    it('returns paginated results with total count', async () => {
      const res = await jsonRequest(`${baseUrl}/api/tasks/${taskId}/results`, 'GET');
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body.results));
      assert.strictEqual(res.body.total, 4);
      assert.strictEqual(res.body.page, 1);
    });

    it('supports domain filter', async () => {
      const res = await jsonRequest(`${baseUrl}/api/tasks/${taskId}/results?domain=ext1`, 'GET');
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.results.every(r => r.url.includes('ext1')));
    });

    it('respects page and limit parameters', async () => {
      const res = await jsonRequest(`${baseUrl}/api/tasks/${taskId}/results?page=1&limit=2`, 'GET');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.results.length, 2);
      assert.strictEqual(res.body.limit, 2);
    });

    it('returns empty array for unknown task', async () => {
      const res = await jsonRequest(`${baseUrl}/api/tasks/nonexistent/results`, 'GET');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.results.length, 0);
      assert.strictEqual(res.body.total, 0);
    });
  });

  describe('GET /api/tasks/:id/stats/top-domains', () => {
    it('returns top external domains', async () => {
      const res = await jsonRequest(`${baseUrl}/api/tasks/${taskId}/stats/top-domains`, 'GET');
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body));
      assert.ok(res.body.length > 0);
      assert.ok(res.body[0].domain);
      assert.ok(res.body[0].count > 0);
    });

    it('respects limit parameter', async () => {
      const res = await jsonRequest(`${baseUrl}/api/tasks/${taskId}/stats/top-domains?limit=1`, 'GET');
      assert.strictEqual(res.body.length, 1);
    });
  });

  describe('GET /api/tasks/:id/stats/top-urls', () => {
    it('returns top external URLs', async () => {
      const res = await jsonRequest(`${baseUrl}/api/tasks/${taskId}/stats/top-urls`, 'GET');
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body));
      assert.ok(res.body.length > 0);
    });
  });
});
