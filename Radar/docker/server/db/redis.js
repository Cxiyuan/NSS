import Redis from 'ioredis';

let client = null;
let connected = false;

function getClient() {
  if (!client) {
    const url = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
    client = new Redis(url);
    client.on('error', (err) => {
      console.warn('Redis error:', err.message);
      connected = false;
    });
    client.on('connect', () => { connected = true; });
  }
  return client;
}

export const redis = {
  // Push a result to the task's result list
  async pushResult(taskId, result) {
    try {
      const c = getClient();
      if (!connected) return false;
      await c.rpush(`radar:task:${taskId}:results`, JSON.stringify(result));
      return true;
    } catch { connected = false; return false; }
  },

  // Get results for a task, filtered by excluded domains
  async getResults(taskId, { page = 1, limit = 50 } = {}) {
    try {
      const c = getClient();
      if (!connected) return null;
      // Get filtered domains
      const filtered = await c.smembers(`radar:task:${taskId}:filtered`);
      // Get all results
      const all = await c.lrange(`radar:task:${taskId}:results`, 0, -1);
      const parsed = all.map(r => JSON.parse(r));
      // Filter
      const filteredResults = filtered.length > 0
        ? parsed.filter(r => { try { const h = new URL(r.url).hostname; return !filtered.includes(h); } catch { return true; } })
        : parsed;
      // Paginate
      const offset = (page - 1) * limit;
      return {
        results: filteredResults.slice(offset, offset + limit).map(r => ({ ...r, isExternal: !!r.isExternal })),
        total: filteredResults.length,
        page,
        limit,
      };
    } catch { return null; }
  },

  // Get top domains from cached results
  async topDomains(taskId, limit = 10) {
    try {
      const c = getClient();
      if (!connected) return [];
      const filtered = await c.smembers(`radar:task:${taskId}:filtered`);
      const all = await c.lrange(`radar:task:${taskId}:results`, 0, -1);
      const domains = {};
      for (const r of all) {
        const result = JSON.parse(r);
        if (!result.isExternal) continue;
        const hostname = new URL(result.url).hostname;
        if (filtered.includes(hostname)) continue;
        domains[hostname] = (domains[hostname] || 0) + 1;
      }
      return Object.entries(domains)
        .map(([domain, count]) => ({ domain, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
    } catch { return []; }
  },

  async topUrls(taskId, limit = 10) {
    try {
      const c = getClient();
      if (!connected) return [];
      const filtered = await c.smembers(`radar:task:${taskId}:filtered`);
      const all = await c.lrange(`radar:task:${taskId}:results`, 0, -1);
      const counts = {};
      for (const r of all) {
        const result = JSON.parse(r);
        if (!result.isExternal) continue;
        const hostname = new URL(result.url).hostname;
        if (filtered.includes(hostname)) continue;
        counts[result.url] = (counts[result.url] || 0) + 1;
      }
      return Object.entries(counts)
        .map(([url, count]) => ({ url, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
    } catch { return []; }
  },

  // Add a filtered domain
  async addFilteredDomain(taskId, domain) {
    try {
      const c = getClient();
      if (!connected) return;
      await c.sadd(`radar:task:${taskId}:filtered`, domain);
    } catch {}
  },

  // Flush task data from Redis to SQLite, then clean up Redis
  async flushToSQLite(taskId, queries) {
    try {
      const c = getClient();
      if (!connected) return;
      const all = await c.lrange(`radar:task:${taskId}:results`, 0, -1);
      for (const r of all) {
        queries.insertResult(taskId, JSON.parse(r));
      }
      // Update task stats in SQLite based on Redis count
      const stats = queries.getTaskStats(taskId);
      queries.updateTaskStats(taskId, stats);
      // Clean up Redis keys
      const keys = await c.keys(`radar:task:${taskId}:*`);
      if (keys.length > 0) await c.del(...keys);
    } catch (err) { console.warn('Redis flush failed:', err.message); }
  },

  get connected() { return connected; },
};
