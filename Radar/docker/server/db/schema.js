// v1.2.QA Sprint 4: schema version tracking.
// Without this, migrations are "shot in the dark" — we check if a
// column exists and ALTER if missing, but we have no global view of
// which migrations have run. This table records each migration as it
// runs; future migrations should check `schema_version` to decide
// whether to apply.
const SCHEMA_VERSION = 4;  // bump on each migration; first migration sets it to 1

export function initDB(db) {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // ── schema_version table (must be created FIRST) ───────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version    INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL,
      description TEXT NOT NULL
    );
  `);

  // Helper: record a migration (idempotent)
  function recordMigration(version, description) {
    db.prepare(
      'INSERT OR IGNORE INTO schema_version (version, applied_at, description) VALUES (?, ?, ?)'
    ).run(version, new Date().toISOString(), description);
  }

  // Helper: check if a migration has been applied
  function hasMigration(version) {
    const row = db.prepare('SELECT 1 FROM schema_version WHERE version = ?').get(version);
    return !!row;
  }

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

  // ── v1.2.QA Sprint 4: register all migrations in schema_version ──
  // These rows are idempotent (INSERT OR IGNORE) so re-running initDB
  // is safe. Each migration here should be wrapped with `if (!hasMigration(N))`
  // in any FUTURE migration work to avoid double-apply.
  recordMigration(1, 'Initial schema: tasks + results tables + indexes');
  recordMigration(2, 'Add status_code column to results');
  recordMigration(3, 'Add risk_level / risk_tags / icp columns to results');
  recordMigration(4, 'Add result_risks normalized table for SQL aggregation');

  // Sanity check: warn if SCHEMA_VERSION constant is out of sync with recorded
  const recordedMax = db.prepare('SELECT MAX(version) as v FROM schema_version').get()?.v || 0;
  if (recordedMax > SCHEMA_VERSION) {
    console.warn(
      `[schema] DB has migrations up to v${recordedMax} but code only knows up to v${SCHEMA_VERSION}. ` +
      `The DB was created by a newer version of the app. Downgrade may break.`
    );
  }
}
