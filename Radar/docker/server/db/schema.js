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
      created_at  TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_results_task ON results(task_id);
    CREATE INDEX IF NOT EXISTS idx_results_external ON results(task_id, is_external);
  `);

  // Migration: add status_code column if missing (older databases)
  const cols = db.pragma('table_info(results)').map(c => c.name);
  if (!cols.includes('status_code')) {
    db.exec('ALTER TABLE results ADD COLUMN status_code INTEGER DEFAULT 0');
  }
}
