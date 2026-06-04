export function initDB(db) {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id         TEXT PRIMARY KEY,
      type       TEXT NOT NULL CHECK(type IN ('url_crawl', 'keyword_search')),
      status     TEXT DEFAULT 'pending' CHECK(status IN ('pending','running','paused','completed','error','cancelled')),
      config     TEXT NOT NULL,
      stats      TEXT DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS results (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      url         TEXT NOT NULL,
      found_on    TEXT NOT NULL,
      link_type   TEXT NOT NULL,
      is_external INTEGER DEFAULT 0,
      depth       INTEGER DEFAULT 0,
      page_title  TEXT,
      status_code INTEGER DEFAULT 0,
      snippet     TEXT,
      risk_level  TEXT DEFAULT 'clean',
      risk_tags   TEXT DEFAULT '',
      icp         TEXT DEFAULT '',
      created_at  TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_results_task ON results(task_id);
  `);

  // Deduplicate before creating unique index (migration for existing databases)
  db.exec(`
    DELETE FROM results
    WHERE rowid NOT IN (
      SELECT MIN(rowid) FROM results GROUP BY task_id, url
    );
  `);

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_results_task_url ON results(task_id, url);
    CREATE INDEX IF NOT EXISTS idx_results_external ON results(task_id, is_external);
  `);

  // Migration: add status_code column if missing (older databases)
  const cols = db.pragma('table_info(results)').map(c => c.name);
  if (!cols.includes('status_code')) {
    db.exec('ALTER TABLE results ADD COLUMN status_code INTEGER DEFAULT 0');
  }

  // Migration: add risk columns if missing
  if (!cols.includes('risk_level')) {
    db.exec("ALTER TABLE results ADD COLUMN risk_level TEXT DEFAULT 'clean'");
    db.exec("ALTER TABLE results ADD COLUMN risk_tags TEXT DEFAULT ''");
    db.exec("ALTER TABLE results ADD COLUMN icp TEXT DEFAULT ''");
  }

  // ── v1.2 P2-1: result_risks normalized table ───────────────────────
  // One row per (result, category) pair. Enables SQL aggregation by
  // category/level without parsing the comma-separated risk_tags string.
  // Backward compatible: results.risk_tags / risk_level / icp are still
  // written (for the existing UI) — result_risks is a derived view.
  db.exec(`
    CREATE TABLE IF NOT EXISTS result_risks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      result_id   INTEGER NOT NULL REFERENCES results(id) ON DELETE CASCADE,
      task_id     TEXT    NOT NULL,
      url         TEXT    NOT NULL,
      category    TEXT    NOT NULL,
      level       TEXT    NOT NULL CHECK(level IN ('clean','suspicious','illegal','blackhat')),
      detail      TEXT    DEFAULT '',
      icp         TEXT    DEFAULT '',
      source      TEXT    DEFAULT 'worker' CHECK(source IN ('worker','footer','api','badge')),
      confidence  REAL    DEFAULT 1.0,
      detected_at TEXT    NOT NULL
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_risks_task ON result_risks(task_id);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_risks_category ON result_risks(category);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_risks_level ON result_risks(level);`);
  // v1.2 P2-1: UNIQUE constraint prevents duplicate (result, category) rows
  // when the worker re-emits tags for the same URL. Use INSERT OR IGNORE.
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_risks_unique ON result_risks(result_id, category);`);
}
