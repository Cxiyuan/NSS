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
import { createConfigRoutes, getConfig } from './routes/config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || join(__dirname, '..', 'data', 'crawler.db');

const dataDir = dirname(DB_PATH);
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

const db = new Database(DB_PATH);
initDB(db);
const queries = createQueries(db);

// Recover zombie tasks: on restart, mark any running/paused tasks as error
// since their workers no longer exist
const zombieTasks = db.prepare("SELECT id, status FROM tasks WHERE status IN ('running','paused')").all();
for (const t of zombieTasks) {
  console.warn(`Recovering zombie task ${t.id} (${t.status} → error)`);
  queries.updateTaskStatus(t.id, 'error');
}

const pool = new WorkerPool(5, (taskId, msg) => {
  if (msg.type === 'result' && msg.result) {
    queries.insertResult(taskId, msg.result);
    const stats = queries.getTaskStats(taskId);
    queries.updateTaskStats(taskId, stats);
  }
  if (msg.type === 'result_title') {
    queries.updateResultStatus(taskId, msg.url, msg.pageTitle, msg.statusCode);
    wsBroadcast(taskId, msg);
    return;
  }
  if (msg.type === 'status') {
    queries.updateTaskStatus(taskId, msg.status);
  }
  wsBroadcast(taskId, msg);
});

const app = express();
app.use(express.json());

app.use('/api/config', createConfigRoutes(dataDir));
app.use('/api/tasks', createTaskRoutes(queries, pool, getConfig));
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

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  // Launch browser in background with timeout — don't block server startup
  Promise.race([
    launchBrowser(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('browser launch timeout')), 15000)),
  ]).then(() => {
    console.log('Browser launched');
  }).catch(err => {
    console.warn('Browser launch failed (Puppeteer may not be available):', err.message);
  });
});

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('Shutting down gracefully...');
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
