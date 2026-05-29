import { Router } from 'express';

export function createExportRoutes(queries, generatePDF) {
  const router = Router();

  router.get('/:id/export/pdf', async (req, res) => {
    const task = queries.getTask(req.params.id);
    if (!task) return res.status(404).json({ error: 'task not found' });

    const { results } = queries.getResults(req.params.id, { limit: 10000 });

    const pdfBuffer = await generatePDF(task, results);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="crawl-results-${req.params.id}.pdf"`);
    res.send(pdfBuffer);
  });

  return router;
}
