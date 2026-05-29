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

  return router;
}
