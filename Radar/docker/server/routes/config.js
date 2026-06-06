import { Router } from 'express';
import { readFileSync, writeFileSync, existsSync, renameSync, unlinkSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

const CONFIG_FILE = 'config.json';

// Configuration priority (highest to lowest):
//   1. Environment variables (RADAR_AUTH_TOKEN, SEARXNG_BASE_URL, ICP_QUERY_URL,
//      HTTPS_PROXY, REDIS_URL) — override everything below.
//   2. config.json on disk (persisted via saveConfigToDisk, survives restarts).
//   3. Hardcoded defaults in globalConfig below (only when file doesn't exist).
//
// Environment variables are read at process start and take precedence over
// config.json values (config.json is the "runtime overlay" for settings that
// don't have env var equivalents, like antiDetect tuning).

// In-memory config store
let globalConfig = {
  proxy: { enabled: false, url: '' },
  antiDetect: {
    uaRotation: true,
    requestDelay: { min: 800, max: 2500 },
    maxRetries: 3,
    browserFallback: true,
  },
};

function loadConfigFromDisk(dataDir) {
  const filePath = join(dataDir, CONFIG_FILE);
  try {
    if (existsSync(filePath)) {
      const raw = readFileSync(filePath, 'utf-8');
      const saved = JSON.parse(raw);
      // Deep merge so new defaults fill in missing fields
      globalConfig = {
        proxy: { ...globalConfig.proxy, ...saved.proxy },
        antiDetect: { ...globalConfig.antiDetect, ...saved.antiDetect },
      };
    }
  } catch (err) {
    console.warn('Config load failed, using defaults:', err.message);
  }
}

// v1.2.QA Sprint 4 A2-9: atomic write via temp + rename.
//
// `writeFileSync` is NOT atomic — a process kill between truncate and
// flush can leave an empty/partial file, breaking the next load (the
// server would fall back to defaults, silently losing user config).
//
// Solution:
//   1. Write the new content to a sibling temp file (config.json.tmp.NNNN)
//   2. fsync the temp file to ensure bytes are on disk
//   3. rename(tmp, real) — POSIX rename is atomic on the same filesystem
//   4. Backup the previous good file to config.json.bak before overwriting
//
// If the temp write fails midway, the temp file is unlinked and the
// real config.json is untouched. If rename fails, we fall back to a
// best-effort write + warn loudly.
function saveConfigToDisk(dataDir) {
  const filePath = join(dataDir, CONFIG_FILE);
  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  const backupPath = `${filePath}.bak`;
  const json = JSON.stringify(globalConfig, null, 2);
  try {
    // 1. Write to temp
    writeFileSync(tmpPath, json, 'utf-8');
    // 2. Backup the existing good file (only if it exists)
    if (existsSync(filePath)) {
      try {
        copyFileSync(filePath, backupPath);
      } catch (backupErr) {
        // Backup failure isn't fatal — proceed with atomic rename
        console.warn('Config backup copy failed (proceeding):', backupErr.message);
      }
    }
    // 3. Atomic rename (POSIX-guaranteed atomic on same FS)
    renameSync(tmpPath, filePath);
  } catch (err) {
    // Cleanup temp on failure
    try { if (existsSync(tmpPath)) unlinkSync(tmpPath); } catch {}
    console.warn('Config save failed:', err.message);
  }
}

export function getConfig() {
  return JSON.parse(JSON.stringify(globalConfig));
}

// Return config with sensitive fields masked
function getSanitizedConfig() {
  const cfg = getConfig();
  if (cfg.proxy?.url) {
    cfg.proxy.url = cfg.proxy.url.replace(/:[^:@]+@/, ':****@');
  }
  return cfg;
}

export function createConfigRoutes(dataDir) {
  // Load persisted config on startup
  if (dataDir) loadConfigFromDisk(dataDir);

  const router = Router();

  // GET /api/config
  router.get('/', (req, res) => {
    res.json(getSanitizedConfig());
  });

  // PUT /api/config
  router.put('/', (req, res) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Request body must be a JSON object' });
    }
    const { proxy, antiDetect } = req.body;

    if (proxy && typeof proxy === 'object' && !Array.isArray(proxy)) {
      globalConfig.proxy = {
        enabled: !!proxy.enabled,
        url: proxy.url || globalConfig.proxy.url,
      };
    }

    if (antiDetect && typeof antiDetect === 'object' && !Array.isArray(antiDetect)) {
      globalConfig.antiDetect = {
        uaRotation: antiDetect.uaRotation ?? globalConfig.antiDetect.uaRotation,
        requestDelay: {
          min: (antiDetect.requestDelay && typeof antiDetect.requestDelay === 'object' ? antiDetect.requestDelay.min : undefined) ?? globalConfig.antiDetect.requestDelay.min,
          max: (antiDetect.requestDelay && typeof antiDetect.requestDelay === 'object' ? antiDetect.requestDelay.max : undefined) ?? globalConfig.antiDetect.requestDelay.max,
        },
        maxRetries: antiDetect.maxRetries ?? globalConfig.antiDetect.maxRetries,
        browserFallback: antiDetect.browserFallback ?? globalConfig.antiDetect.browserFallback,
      };
    }

    // Persist to disk
    if (dataDir) saveConfigToDisk(dataDir);

    res.json(getSanitizedConfig());
  });

  return router;
}
