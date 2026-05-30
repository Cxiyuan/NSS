import { Router } from 'express';

export function createResultRoutes(queries) {
  const router = Router();

  router.get('/:id/results', (req, res) => {
    const { domain, page = 1, limit = 50 } = req.query;
    const data = queries.getResults(req.params.id, {
      domain,
      page: Number(page),
      limit: Number(limit),
    });
    res.json(data);
  });

  // GET /api/tasks/:id/stats/top-domains?limit=5
  router.get('/:id/stats/top-domains', (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 5, 50);
    const rows = queries.topExternalDomains(req.params.id, limit);
    res.json(rows);
  });

  router.get('/:id/stats/top-urls', (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 5, 50);
    const rows = queries.topExternalUrls(req.params.id, limit);
    res.json(rows);
  });

  return router;
}
