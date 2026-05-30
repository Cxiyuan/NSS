import { Router } from 'express';
import { v4 as uuid } from 'uuid';

export function createTaskRoutes(queries, pool, getConfig) {
  const router = Router();

  router.post('/', (req, res) => {
    const { type, url, keywords, depth = 3, concurrency = 3, filters = [], searchEngine, searchApiKey, searchCx } = req.body;

    if (!type || !['url_crawl', 'keyword_search'].includes(type)) {
      return res.status(400).json({ error: 'type must be url_crawl or keyword_search' });
    }
    if (type === 'url_crawl' && !url) {
      return res.status(400).json({ error: 'url is required for url_crawl' });
    }
    if (type === 'keyword_search' && !keywords) {
      return res.status(400).json({ error: 'keywords is required for keyword_search' });
    }

    const id = uuid();
    // Inject global anti-detect config into task
    const globalCfg = getConfig ? getConfig() : {};
    const antiDetect = globalCfg.antiDetect || {};
    if (globalCfg.proxy?.enabled && globalCfg.proxy.url) {
      antiDetect.proxy = globalCfg.proxy.url;
    }
    const config = { type, url, keywords, depth, concurrency, filters, searchEngine, searchApiKey, searchCx, antiDetect };
    // Strip secrets from the config before storing to DB — worker still gets full config
    const { searchApiKey: _, searchCx: __, ...safeConfig } = config;
    const task = queries.createTask({ id, type, config: safeConfig });

    if (pool) {
      const worker = pool.startTask(id, { taskId: id, ...config });
      if (worker === null) {
        // Pool at capacity — clean up the DB entry and return 429
        queries.deleteTask(id);
        return res.status(429).json({ error: 'Server busy — too many concurrent tasks. Try again later.' });
      }
    }

    res.status(201).json(task);
  });

  router.get('/', (req, res) => {
    const { limit = 20, offset = 0 } = req.query;
    const tasks = queries.listTasks(Number(limit), Number(offset));
    res.json(tasks);
  });

  router.get('/:id', (req, res) => {
    const task = queries.getTask(req.params.id);
    if (!task) return res.status(404).json({ error: 'task not found' });
    const stats = queries.getTaskStats(req.params.id);
    task.stats = { ...task.stats, ...stats };
    res.json(task);
  });

  router.post('/:id/pause', (req, res) => {
    queries.updateTaskStatus(req.params.id, 'paused');
    if (pool) pool.pauseTask(req.params.id);
    res.json({ status: 'paused' });
  });

  router.post('/:id/resume', (req, res) => {
    queries.updateTaskStatus(req.params.id, 'running');
    if (pool) pool.resumeTask(req.params.id);
    res.json({ status: 'running' });
  });

  router.post('/:id/cancel', (req, res) => {
    queries.updateTaskStatus(req.params.id, 'cancelled');
    if (pool) pool.cancelTask(req.params.id);
    res.json({ status: 'cancelled' });
  });

  router.delete('/:id', (req, res) => {
    if (pool) pool.cancelTask(req.params.id);
    queries.deleteTask(req.params.id);
    res.json({ deleted: true });
  });

  return router;
}
