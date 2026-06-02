import { Router } from 'express';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const CONFIG_FILE = 'config.json';

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

function saveConfigToDisk(dataDir) {
  const filePath = join(dataDir, CONFIG_FILE);
  try {
    writeFileSync(filePath, JSON.stringify(globalConfig, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Config save failed:', err.message);
  }
}

export function getConfig() {
  return JSON.parse(JSON.stringify(globalConfig));
}

export function createConfigRoutes(dataDir) {
  // Load persisted config on startup
  if (dataDir) loadConfigFromDisk(dataDir);

  const router = Router();

  // GET /api/config
  router.get('/', (req, res) => {
    res.json(getConfig());
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

    res.json(getConfig());
  });

  return router;
}
