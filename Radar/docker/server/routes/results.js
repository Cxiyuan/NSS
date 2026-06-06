import { Router } from 'express';
import { redis } from '../db/redis.js';

export function createResultRoutes(queries, getTask) {
  const router = Router();

  router.get('/:id/results', async (req, res) => {
    const p = Math.max(1, Math.min(10000, Number(req.query.page) || 1));
    const l = Math.max(1, Math.min(200, Number(req.query.limit) || 50));

    // v1.2.QA: always read from SQLite — Redis results don't have risk fields
    // (risk_level/risk_tags/icp are only written to SQLite by updateResultRisk).
    // Reading from Redis during a running task would show clean results without
    // detection tags, defeating the purpose of real-time risk display.
    const data = queries.getResults(req.params.id, {
      domain: req.query.domain,
      icp: req.query.icp !== undefined ? req.query.icp : null,
      riskLevel: req.query.riskLevel || null,
      showAll: req.query.showAll === '1' || req.query.showAll === 'true',
      page: p,
      limit: l,
    });
    res.json(data);
  });

  // GET /api/tasks/:id/stats/top-domains?limit=5
  router.get('/:id/stats/top-domains', async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 5, 50);
    const task = getTask ? getTask(req.params.id) : null;
    const isRunning = task && ['running', 'paused', 'pending'].includes(task.status);

    if (isRunning && redis.connected) {
      const data = await redis.topDomains(req.params.id, limit);
      if (data) return res.json(data);
    }

    const rows = queries.topExternalDomains(req.params.id, limit);
    res.json(rows);
  });

  router.get('/:id/stats/top-urls', async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 5, 50);
    const task = getTask ? getTask(req.params.id) : null;
    const isRunning = task && ['running', 'paused', 'pending'].includes(task.status);

    if (isRunning && redis.connected) {
      const data = await redis.topUrls(req.params.id, limit);
      if (data) return res.json(data);
    }

    const rows = queries.topExternalUrls(req.params.id, limit);
    res.json(rows);
  });

  return router;
}
