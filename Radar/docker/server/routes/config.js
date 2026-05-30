import { Router } from 'express';

// In-memory config store (survives process lifetime)
let globalConfig = {
  proxy: { enabled: false, url: '' },
  antiDetect: {
    uaRotation: true,
    requestDelay: { min: 800, max: 2500 },
    maxRetries: 3,
    browserFallback: true,
  },
};

export function getConfig() {
  return JSON.parse(JSON.stringify(globalConfig));
}

export function createConfigRoutes() {
  const router = Router();

  // GET /api/config
  router.get('/', (req, res) => {
    res.json(getConfig());
  });

  // PUT /api/config
  router.put('/', (req, res) => {
    const { proxy, antiDetect } = req.body;

    if (proxy) {
      globalConfig.proxy = {
        enabled: !!proxy.enabled,
        url: proxy.url || globalConfig.proxy.url,
      };
    }

    if (antiDetect) {
      globalConfig.antiDetect = {
        uaRotation: antiDetect.uaRotation ?? globalConfig.antiDetect.uaRotation,
        requestDelay: {
          min: antiDetect.requestDelay?.min ?? globalConfig.antiDetect.requestDelay.min,
          max: antiDetect.requestDelay?.max ?? globalConfig.antiDetect.requestDelay.max,
        },
        maxRetries: antiDetect.maxRetries ?? globalConfig.antiDetect.maxRetries,
        browserFallback: antiDetect.browserFallback ?? globalConfig.antiDetect.browserFallback,
      };
    }

    res.json(getConfig());
  });

  return router;
}
