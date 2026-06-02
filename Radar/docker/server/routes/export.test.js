import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import express from 'express';
import Database from 'better-sqlite3';
import { initDB } from '../db/schema.js';
import { createQueries } from '../db/queries.js';
import { createTaskRoutes } from './tasks.js';
import { createExportRoutes } from './export.js';
import { generatePDF } from '../utils/export-pdf.js';
import { unlinkSync } from 'node:fs';
import http from 'node:http';

const TEST_DB = './data/test-export.db';

function request(url, method) {
  return new Promise((resolve, reject) => {
    const { hostname, port, pathname } = new URL(url);
    const req = http.request({
      hostname, port, path: pathname, method,
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        resolve({ status: res.statusCode, contentType: res.headers['content-type'], body });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

describe('Export API', () => {
  let server, db, queries, baseUrl;
  let taskId;

  before(async () => {
    try { unlinkSync(TEST_DB); } catch {}
    db = new Database(TEST_DB);
    initDB(db);
    queries = createQueries(db);

    const app = express();
    app.use(express.json());
    app.use('/api/tasks', createTaskRoutes(queries, null));
    app.use('/api/tasks', createExportRoutes(queries, generatePDF));

    await new Promise(resolve => {
      server = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });

    // Seed a task
    const createRes = await new Promise(resolve => {
      const data = JSON.stringify({ type: 'url_crawl', url: 'https://export-seed.com', depth: 1, concurrency: 1, filters: [] });
      const req = http.request(`${baseUrl}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
      });
      req.write(data);
      req.end();
    });
    taskId = createRes.body.id;

    // Add some results
    queries.insertResult(taskId, { url: 'https://ext1.com', foundOn: 'https://seed.com', linkType: 'a', isExternal: true, depth: 1 });
    queries.insertResult(taskId, { url: 'https://ext2.com', foundOn: 'https://seed.com', linkType: 'script', isExternal: true, depth: 2 });
  });

  after(() => {
    server?.close();
    db?.close();
    try { unlinkSync(TEST_DB); } catch {}
  });

  describe('GET /api/tasks/:id/export/pdf', () => {
    it('returns PDF for existing task', async () => {
      const res = await request(`${baseUrl}/api/tasks/${taskId}/export/pdf`, 'GET');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.contentType, 'application/pdf');
      assert.ok(Buffer.from(res.body, 'binary').length > 100);
    });

    it('returns 404 for unknown task', async () => {
      const res = await request(`${baseUrl}/api/tasks/nonexistent/export/pdf`, 'GET');
      assert.strictEqual(res.status, 404);
    });
  });
});
