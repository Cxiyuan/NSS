import { createServer } from 'node:http';
import express from 'express';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';

import { initDB } from './db/schema.js';
import { createQueries } from './db/queries.js';
import { createTaskRoutes } from './routes/tasks.js';
import { createResultRoutes } from './routes/results.js';
import { createExportRoutes } from './routes/export.js';
import { createWSServer } from './ws/handler.js';
import { WorkerPool } from './crawler/pool.js';
import { generatePDF } from './utils/export-pdf.js';
import { launchBrowser } from './crawler/browser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || join(__dirname, '..', 'data', 'crawler.db');

const dataDir = dirname(DB_PATH);
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

const db = new Database(DB_PATH);
initDB(db);
const queries = createQueries(db);

const pool = new WorkerPool(5, (taskId, msg) => {
  if (msg.type === 'result' && msg.result) {
    queries.insertResult(taskId, msg.result);
    const stats = queries.getTaskStats(taskId);
    queries.updateTaskStats(taskId, stats);
  }
  if (msg.type === 'status') {
    queries.updateTaskStatus(taskId, msg.status);
  }
  wsBroadcast(taskId, msg);
});

const app = express();
app.use(express.json());

app.use('/api/tasks', createTaskRoutes(queries, pool));
app.use('/api/tasks', createResultRoutes(queries));
app.use('/api/tasks', createExportRoutes(queries, generatePDF));

const clientDist = join(__dirname, '..', 'client', 'dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/ws')) return next();
    res.sendFile(join(clientDist, 'index.html'));
  });
}

const server = createServer(app);

const { broadcast: wsBroadcast } = createWSServer(server);

server.listen(PORT, async () => {
  console.log(`Server running at http://localhost:${PORT}`);
  try {
    await launchBrowser();
    console.log('Browser launched');
  } catch (err) {
    console.warn('Browser launch failed (Puppeteer may not be available):', err.message);
  }
});

process.on('SIGTERM', () => {
  server.close(() => {
    db.close();
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  server.close(() => {
    db.close();
    process.exit(0);
  });
});
