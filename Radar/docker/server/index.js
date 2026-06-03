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
  // Record the reason in task config so the UI can display it
  const task = queries.getTask(t.id);
  if (task) {
    task.config = { ...task.config, error_message: 'Server restarted while task was running — worker lost' };
    queries.updateTaskConfig(t.id, task.config);
  }
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

// ─── 可选鉴权（通过 RADAR_AUTH_TOKEN 环境变量启用） ───
function requireAuth(req, res, next) {
  const token = process.env.RADAR_AUTH_TOKEN;
  if (!token) return next(); // 未设置 token = 不启用（向后兼容本地使用）
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${token}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}
app.use('/api', requireAuth);

// ─── 健康检查端点（不经鉴权） ────────────
app.get('/healthz', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});
app.get('/readyz', (req, res) => {
  const ready = db?.open;
  res.status(ready ? 200 : 503).json({ status: ready ? 'ok' : 'not ready' });
});

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

const { wss, broadcast: wsBroadcast } = createWSServer(server);

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
let shutdownTimer = null;

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('Shutting down gracefully...');
  server.close();
  wss.close(); // Stop accepting new WS connections + clear heartbeat timer
  if (pool) pool.shutdownAll();
  // Wait for all workers to exit (max 5s)
  const workers = pool?.getWorkers?.() || [];
  if (workers.length > 0) {
    await Promise.race([
      Promise.all(workers.map(w => new Promise(r => w.once('exit', r)))),
      new Promise(r => { shutdownTimer = setTimeout(r, 5000); }),
    ]);
  }
  await closeBrowser().catch(() => {});
  await redis.disconnect().catch(() => {});
  db.close();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
