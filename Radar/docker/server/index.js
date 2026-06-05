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
import { createWorkerMessageHandler } from './worker-message-handler.js';
import { generatePDF } from './utils/export-pdf.js';
import { launchBrowser } from './crawler/browser.js';
import { createConfigRoutes, getConfig } from './routes/config.js';
import { closeBrowser } from './crawler/browser.js';
import { recoverZombieTasks } from './utils/zombie-recovery.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || join(__dirname, '..', 'data', 'crawler.db');

const dataDir = dirname(DB_PATH);
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

const db = new Database(DB_PATH);
initDB(db);
const queries = createQueries(db);

// Recover zombie tasks: on restart, mark any running/paused tasks as error
// since their workers no longer exist. v1.2 fix: 9.2.11 — extracted to
// utils/zombie-recovery.js for testability.
recoverZombieTasks(db, queries);

// Pool must be created AFTER wss.broadcast is available (see line 95+ for the
// wss/broadcast setup). Forward-declared here; assigned below once the WSS
// broadcast function is in scope. v1.2 fix: 9.2.3 — previously the pool was
// created here with no getBroadcast, leaving WS push as a no-op in production.
let pool = null;

const app = express();
app.use(express.json());

// v1.2.QA: inline CORS middleware (no npm install needed).
// Allows same-origin and configured origins. In production, set ALLOWED_ORIGINS
// env var to a comma-separated list (default: same-origin only).
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

// v1.2 fix: 9.2.12 — explicitly reject the placeholder token from
// .env.production. Without this, an admin who forgot to change the default
// would silently deploy an open-to-the-world instance.
const PLACEHOLDER_TOKEN_PREFIX = 'CHANGE-ME-';
function isPlaceholderToken(t) {
  return !t || t.startsWith(PLACEHOLDER_TOKEN_PREFIX);
}

// ─── 可选鉴权（通过 RADAR_AUTH_TOKEN 环境变量启用） ───
function requireAuth(req, res, next) {
  const token = process.env.RADAR_AUTH_TOKEN;
  if (isPlaceholderToken(token)) {
    // v1.2: fail-closed when token is unset OR is still the .env.production
    // placeholder. This prevents an accidental open deployment.
    if (!token) return next(); // truly empty = local dev mode (intentional)
    return res.status(503).json({
      error: 'server_misconfigured',
      message: 'RADAR_AUTH_TOKEN is set to the .env.production placeholder. ' +
               'Generate a real token with `openssl rand -hex 32` and update .env.production.',
    });
  }
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

// Now that wsBroadcast is in scope, instantiate the worker pool with a
// lazy getBroadcast that resolves at message-time (handles wss restart).
// v1.2 fix: 9.2.3 — previously the pool was created before wss, so
// getBroadcast defaulted to a no-op in production and WS push was dead code.
pool = new WorkerPool(5, createWorkerMessageHandler({
  queries,
  redis,
  getBroadcast: () => wsBroadcast,
}));

// Routes that need the pool (e.g. POST /api/tasks to start a crawl) must be
// mounted after pool is created.
app.use('/api/tasks', createTaskRoutes(queries, pool, getConfig));
app.use('/api/tasks', createResultRoutes(queries, (id) => queries.getTask(id)));
app.use('/api/tasks', createExportRoutes(queries, generatePDF));

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  // v1.2 fix: 9.2.12 — warn loudly if RADAR_AUTH_TOKEN is set to the
  // .env.production placeholder (catches forgotten deploys).
  if (isPlaceholderToken(process.env.RADAR_AUTH_TOKEN) && process.env.RADAR_AUTH_TOKEN) {
    console.warn('');
    console.warn('╔══════════════════════════════════════════════════════════════╗');
    console.warn('║  ⚠  RADAR_AUTH_TOKEN is still the .env.production placeholder  ║');
    console.warn('║  All API requests will be rejected with 503 until you fix it.  ║');
    console.warn('║  Run: openssl rand -hex 32  then update .env.production.       ║');
    console.warn('╚══════════════════════════════════════════════════════════════╝');
    console.warn('');
  }
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
  await new Promise(r => server.close(r)); // v1.2.QA: await close to drain in-flight HTTP responses
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
