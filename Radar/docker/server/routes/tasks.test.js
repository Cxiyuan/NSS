import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import express from 'express';
import Database from 'better-sqlite3';
import { initDB } from '../db/schema.js';
import { createQueries } from '../db/queries.js';
import { createTaskRoutes } from './tasks.js';
import { createResultRoutes } from './results.js';
import { unlinkSync } from 'node:fs';

const TEST_DB = './data/test-routes.db';

function jsonRequest(url, method, body) {
  return new Promise((resolve, reject) => {
    const { hostname, port, pathname } = new URL(url);
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname, port, path: pathname, method,
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

describe('API routes', () => {
  let server, db, queries;
  let baseUrl;

  before(async () => {
    try { unlinkSync(TEST_DB); } catch {}
    db = new Database(TEST_DB);
    initDB(db);
    queries = createQueries(db);

    const app = express();
    app.use(express.json());
    app.use('/api/tasks', createTaskRoutes(queries));
    app.use('/api/tasks', createResultRoutes(queries));

    await new Promise(resolve => {
      server = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });
  });

  after(() => {
    server?.close();
    db?.close();
    try { unlinkSync(TEST_DB); } catch {}
  });

  describe('POST /api/tasks', () => {
    it('creates a url_crawl task and returns 201', async () => {
      const res = await jsonRequest(`${baseUrl}/api/tasks`, 'POST', {
        type: 'url_crawl',
        url: 'https://example.com',
        depth: 3,
        concurrency: 3,
        filters: [],
      });
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.type, 'url_crawl');
      assert.ok(res.body.id);
    });

    it('rejects missing type with 400', async () => {
      const res = await jsonRequest(`${baseUrl}/api/tasks`, 'POST', { url: 'https://x.com' });
      assert.strictEqual(res.status, 400);
    });
  });

  describe('GET /api/tasks', () => {
    it('returns task list', async () => {
      const res = await jsonRequest(`${baseUrl}/api/tasks`, 'GET');
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body));
    });
  });

  describe('GET /api/tasks/:id', () => {
    it('returns task by id', async () => {
      const create = await jsonRequest(`${baseUrl}/api/tasks`, 'POST', {
        type: 'keyword_search', keywords: 'test', depth: 2, concurrency: 2, filters: [],
        searchEngine: 'google', searchApiKey: 'key123',
      });
      const res = await jsonRequest(`${baseUrl}/api/tasks/${create.body.id}`, 'GET');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.type, 'keyword_search');
    });

    it('returns 404 for unknown id', async () => {
      const res = await jsonRequest(`${baseUrl}/api/tasks/nonexistent`, 'GET');
      assert.strictEqual(res.status, 404);
    });
  });
});
