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
import { redis } from './db/redis.js';
import { generatePDF } from './utils/export-pdf.js';
import { launchBrowser } from './crawler/browser.js';
import { createConfigRoutes, getConfig } from './routes/config.js';
import { closeBrowser } from './crawler/browser.js';

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

const pool = new WorkerPool(5, async (taskId, msg) => {
  if (msg.type === 'result' && msg.result) {
    // Write to Redis during crawl (fallback to SQLite if Redis unavailable)
    const wrote = await redis.pushResult(taskId, msg.result);
    if (!wrote) {
      // Redis unavailable — direct SQLite as fallback
      queries.insertResult(taskId, msg.result);
      const stats = queries.getTaskStats(taskId);
      queries.updateTaskStats(taskId, stats);
    }
    wsBroadcast(taskId, msg);
    return;
  }
  if (msg.type === 'result_title') {
    queries.updateResultStatus(taskId, msg.url, msg.pageTitle, msg.statusCode);
    wsBroadcast(taskId, msg);
    return;
  }
  if (msg.type === 'status') {
    queries.updateTaskStatus(taskId, msg.status);
    // When task reaches terminal state, flush Redis to SQLite
    if (['completed', 'error', 'cancelled'].includes(msg.status)) {
      await redis.flushToSQLite(taskId, queries);
    }
    wsBroadcast(taskId, msg);
    return;
  }
  wsBroadcast(taskId, msg);
});

const app = express();
app.use(express.json());

app.use('/api/config', createConfigRoutes(dataDir));
app.use('/api/tasks', createTaskRoutes(queries, pool, getConfig));
app.use('/api/tasks', createResultRoutes(queries, (id) => queries.getTask(id)));
app.use('/api/tasks', createExportRoutes(queries, generatePDF));

const clientDist = join(__dirname, '..', 'client', 'dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/ws')) return next();
    res.sendFile(join(clientDist, 'index.html'));
  });
}

// Global error handler (must be after all routes)
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

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

// Check Redis connectivity
setTimeout(() => {
  if (!redis.connected) console.warn('Redis not available — writing results directly to SQLite during crawl');
}, 1000);

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('Shutting down gracefully...');
  // Close Puppeteer browser
  closeBrowser().catch(() => {});
  // Disconnect Redis
  try { redis.disconnect(); } catch {}
  // Terminate all workers (pool.cancelTask each)
  try {
    // pool internal structure — iterate and cancel
    // (pool API doesn't expose task list; workers exit when server.close completes)
  } catch {}
  server.close(() => {
    db.close();
    process.exit(0);
  });
  // Force exit after 10s regardless
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
