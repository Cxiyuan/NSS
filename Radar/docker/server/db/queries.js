export function createQueries(db) {
  return {
    createTask({ id, type, config }) {
      const now = new Date().toISOString();
      db.prepare(
        'INSERT INTO tasks (id, type, status, config, stats, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(id, type, 'pending', JSON.stringify(config), '{"crawled":0,"total":0}', now, now);
      return this.getTask(id);
    },

    getTask(id) {
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
      if (!task) return null;
      return {
        ...task,
        config: JSON.parse(task.config),
        stats: JSON.parse(task.stats || '{}'),
      };
    },

    listTasks(limit = 20, offset = 0) {
      const tasks = db.prepare(
        'SELECT * FROM tasks ORDER BY created_at DESC LIMIT ? OFFSET ?'
      ).all(limit, offset);
      return tasks.map(t => ({
        ...t,
        config: JSON.parse(t.config),
        stats: JSON.parse(t.stats || '{}'),
      }));
    },

    updateTaskStatus(id, status) {
      const now = new Date().toISOString();
      db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?').run(status, now, id);
    },

    updateTaskStats(id, stats) {
      const now = new Date().toISOString();
      db.prepare('UPDATE tasks SET stats = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(stats), now, id);
    },

    deleteTask(id) {
      db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    },

    insertResult(taskId, { url, foundOn, linkType, isExternal, depth, pageTitle, statusCode, snippet }) {
      const now = new Date().toISOString();
      return db.prepare(
        'INSERT INTO results (task_id, url, found_on, link_type, is_external, depth, page_title, status_code, snippet, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(taskId, url, foundOn, linkType, isExternal ? 1 : 0, depth, pageTitle || '', statusCode || 0, snippet || '', now);
    },

    updateResultStatus(taskId, url, pageTitle, statusCode) {
      db.prepare('UPDATE results SET page_title = ?, status_code = ? WHERE task_id = ? AND url = ?')
        .run(pageTitle || '', statusCode || 0, taskId, url);
    },

    getResults(taskId, { domain, page = 1, limit = 50 } = {}) {
      let where = 'WHERE task_id = ?';
      const params = [taskId];

      if (domain) {
        where += ' AND url LIKE ?';
        params.push(`%${domain}%`);
      }

      const offset = (page - 1) * limit;
      const results = db.prepare(
        `SELECT * FROM results ${where} ORDER BY depth ASC, id ASC LIMIT ? OFFSET ?`
      ).all(...params, limit, offset);

      const totalRow = db.prepare(
        `SELECT COUNT(*) as count FROM results ${where}`
      ).get(...params);

      return {
        results: results.map(r => ({
          ...r,
          isExternal: !!r.is_external,
        })),
        total: totalRow.count,
        page,
        limit,
      };
    },

    getTaskStats(taskId) {
      const external = db.prepare(
        'SELECT COUNT(*) as count FROM results WHERE task_id = ? AND is_external = 1'
      ).get(taskId);
      const total = db.prepare(
        'SELECT COUNT(*) as count FROM results WHERE task_id = ?'
      ).get(taskId);
      return { external: external.count, total: total.count };
    },

    topExternalUrls(taskId, limit = 5) {
      const rows = db.prepare(`
        SELECT url, COUNT(*) AS count
        FROM results
        WHERE task_id = ? AND is_external = 1
        GROUP BY url
        ORDER BY count DESC
        LIMIT ?
      `).all(taskId, limit);
      return rows;
    },

    topExternalDomains(taskId, limit = 5) {
      // Extract hostname from URL (strip protocol and path) and count external links per domain
      const rows = db.prepare(`
        SELECT
          SUBSTR(SUBSTR(url, INSTR(url, '://') + 3), 1,
            CASE WHEN INSTR(SUBSTR(url, INSTR(url, '://') + 3), '/') > 0
              THEN INSTR(SUBSTR(url, INSTR(url, '://') + 3), '/') - 1
              ELSE LENGTH(SUBSTR(url, INSTR(url, '://') + 3))
            END
          ) AS domain,
          COUNT(*) AS count
        FROM results
        WHERE task_id = ? AND is_external = 1
        GROUP BY domain
        ORDER BY count DESC
        LIMIT ?
      `).all(taskId, limit);
      return rows;
    },
  };
}
