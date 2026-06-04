export function createQueries(db) {
  const insertResultStmt = db.prepare(
    'INSERT OR IGNORE INTO results (task_id, url, found_on, link_type, is_external, depth, page_title, status_code, snippet, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );

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

    updateTaskConfig(id, config) {
      const now = new Date().toISOString();
      db.prepare('UPDATE tasks SET config = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(config), now, id);
    },

    deleteTask(id) {
      db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    },

    insertResult(taskId, { url, foundOn, linkType, isExternal, depth, pageTitle, statusCode, snippet }) {
      const now = new Date().toISOString();
      return insertResultStmt.run(taskId, url, foundOn, linkType, isExternal ? 1 : 0, depth, pageTitle || '', statusCode || 0, snippet || '', now);
    },

    updateResultStatus(taskId, url, pageTitle, statusCode) {
      db.prepare('UPDATE results SET page_title = ?, status_code = ? WHERE task_id = ? AND url = ?')
        .run(pageTitle || '', statusCode || 0, taskId, url);
    },

    // Persist detection tags + ICP for a result (called by index.js on result_tags WS message).
    // Joins on (task_id, url) so detection arriving after the result INSERT is matched correctly.
    // Safe no-op if the result row doesn't exist yet (race with concurrent result INSERT).
    //
    // v1.2 P2-1: also writes to result_risks normalized table (one row per
    // category) for SQL aggregation. The denormalized results.risk_tags
    // column is preserved for the existing UI. Both writes are atomic per
    // statement; result_risks is INSERT OR IGNORE so re-detection of the
    // same (result, category) is a no-op (not an error).
    updateResultRisk(taskId, url, riskLevel, riskTags, icp) {
      db.prepare(
        'UPDATE results SET risk_level = ?, risk_tags = ?, icp = ? WHERE task_id = ? AND url = ?'
      ).run(riskLevel, riskTags, icp, taskId, url);
      this._writeNormalizedRisks(taskId, url, riskLevel, riskTags, icp);
    },

    // Internal: split comma-separated risk_tags into one row per category.
    // Also writes a synthetic 'has-icp' (or 'no-icp') row when ICP is set/empty.
    // Called only from updateResultRisk to keep denormalized + normalized in sync.
    _writeNormalizedRisks(taskId, url, riskLevel, riskTags, icp) {
      // Find the result row (may not exist yet — safe to skip normalized write)
      const resultRow = db.prepare(
        'SELECT id FROM results WHERE task_id = ? AND url = ?'
      ).get(taskId, url);
      if (!resultRow) return;
      const resultId = resultRow.id;
      const now = new Date().toISOString();
      const insertRisk = db.prepare(
        `INSERT OR IGNORE INTO result_risks
         (result_id, task_id, url, category, level, detail, icp, source, confidence, detected_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      // Parse category from "category:count" tags (e.g. "porn:2", "free-tld")
      const tags = (riskTags || '').split(',').map(s => s.trim()).filter(Boolean);
      for (const tag of tags) {
        const colonIdx = tag.indexOf(':');
        const category = colonIdx > 0 ? tag.slice(0, colonIdx) : tag;
        const detail = colonIdx > 0 ? tag.slice(colonIdx + 1) : '';  // count or reason
        // For blacklink tags, the "detail" is the evidence (e.g. "1:css-hide:display:none")
        // and source defaults to 'worker' (came from link-extractor).
        insertRisk.run(resultId, taskId, url, category, riskLevel, detail, icp || '', 'worker', 1.0, now);
      }
      // Synthetic ICP row (always write, even when tags is empty)
      if (icp) {
        insertRisk.run(resultId, taskId, url, 'has-icp', 'clean', '', icp, 'worker', 1.0, now);
      } else {
        insertRisk.run(resultId, taskId, url, 'no-icp', 'clean', '', '', 'worker', 1.0, now);
      }
    },

    // ── v1.2 P2-1: aggregation queries over result_risks ─────────────
    // Returns { total, byCategory: {porn: N, ...}, byLevel: {illegal: N, ...}, icpCoverage: {with: N, without: N} }
    getRiskSummary(taskId) {
      const total = db.prepare(
        'SELECT COUNT(*) as count FROM result_risks WHERE task_id = ?'
      ).get(taskId).count;
      const byCategory = {};
      const catRows = db.prepare(
        `SELECT category, COUNT(*) as count FROM result_risks WHERE task_id = ? GROUP BY category`
      ).all(taskId);
      for (const r of catRows) byCategory[r.category] = r.count;
      const byLevel = {};
      const lvlRows = db.prepare(
        `SELECT level, COUNT(*) as count FROM result_risks WHERE task_id = ? GROUP BY level`
      ).all(taskId);
      for (const r of lvlRows) byLevel[r.level] = r.count;
      const withIcp = db.prepare(
        `SELECT COUNT(*) as count FROM result_risks WHERE task_id = ? AND category = 'has-icp'`
      ).get(taskId).count;
      const icpCoverage = {
        with: withIcp,
        without: total - withIcp,
        rate: total > 0 ? Math.round((withIcp / total) * 1000) / 1000 : 0,
      };
      return { total, byCategory, byLevel, icpCoverage };
    },

    // Returns the rows for a given category (default sort: detection time)
    getRisksByCategory(taskId, category) {
      return db.prepare(
        `SELECT * FROM result_risks WHERE task_id = ? AND category = ? ORDER BY detected_at DESC`
      ).all(taskId, category);
    },

    // Returns URLs with their worst risk level (illegal > blackhat > suspicious > clean)
    getRisksByLevel(taskId, level) {
      return db.prepare(
        `SELECT url, COUNT(*) as tag_count, MAX(detected_at) as last_seen
         FROM result_risks WHERE task_id = ? AND level = ?
         GROUP BY url ORDER BY last_seen DESC`
      ).all(taskId, level);
    },

    getResults(taskId, { domain, icp, riskLevel, page = 1, limit = 50 } = {}) {
      let where = 'WHERE task_id = ?';
      const params = [taskId];

      if (domain) {
        where += ' AND url LIKE ?';
        params.push(`%${domain}%`);
      }

      // v1.2: ICP 反查 — match substring (e.g. '京' matches '京ICP备xxx号')
      // Empty-string icp means "show only un-registered" (icp = ''); pass `icp: null` to skip filter.
      if (icp !== undefined && icp !== null) {
        if (icp === '') {
          where += " AND (icp IS NULL OR icp = '')";
        } else {
          where += ' AND icp LIKE ?';
          params.push(`%${icp}%`);
        }
      }

      // v1.2: risk level filter (clean/suspicious/illegal/blackhat)
      if (riskLevel) {
        where += ' AND risk_level = ?';
        params.push(riskLevel);
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

    // 批量刷新结果（事务包装，用于 Redis flush）
    flushResults(rows) {
      const insertBatch = db.transaction((items) => {
        for (const r of items) {
          insertResultStmt.run(...r);
        }
      });
      insertBatch(rows);
    },
  };
}
