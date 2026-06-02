// Anti-detection evasion engine
// UA rotation, delay jitter, header randomization, retry with backoff, proxy

const UA_POOL = [
  // Chrome 120-124 on Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  // Chrome 120-124 on macOS
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  // Firefox 124-126 on Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
  // Firefox on macOS
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:126.0) Gecko/20100101 Firefox/126.0',
  // Safari on macOS
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15',
  // Edge on Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0',
  // Chrome on Linux
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  // Firefox on Linux
  'Mozilla/5.0 (X11; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0',
  'Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0',
];

const ACCEPT_LANGUAGES = [
  'zh-CN,zh;q=0.9,en;q=0.8',
  'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
  'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
  'zh-CN,zh;q=0.9',
  'zh-CN,zh;q=0.8,en;q=0.6',
];

const REFERER_POOL = [
  'https://www.google.com/',
  'https://www.baidu.com/',
  'https://www.bing.com/',
  '',
];

export class AntiDetect {
  #uaIndex = Math.floor(Math.random() * UA_POOL.length);
  #requestCount = 0;

  constructor(config = {}) {
    this.config = {
      uaRotation: config.uaRotation !== false,
      requestDelay: config.requestDelay || { min: 800, max: 2500 },
      maxRetries: config.maxRetries ?? 3,
      browserFallback: config.browserFallback !== false,
      proxy: config.proxy || null,
    };
  }

  // Pick next UA (round-robin through pool)
  getUA() {
    if (!this.config.uaRotation) return UA_POOL[0];
    this.#uaIndex = (this.#uaIndex + 1) % UA_POOL.length;
    return UA_POOL[this.#uaIndex];
  }

  // Build full request headers with randomization
  buildHeaders(referer = '') {
    this.#requestCount++;
    const lang = ACCEPT_LANGUAGES[this.#requestCount % ACCEPT_LANGUAGES.length];
    const ref = referer || REFERER_POOL[this.#requestCount % REFERER_POOL.length];

    const headers = {
      'User-Agent': this.getUA(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': lang,
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': this.#requestCount % 3 === 0 ? 'max-age=0' : 'no-cache',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
    };

    if (ref) {
      headers['Referer'] = ref;
    }

    return headers;
  }

  // Random delay with jitter
  async delay() {
    const { min, max } = this.config.requestDelay;
    const base = min + Math.random() * (max - min);
    // Add jitter: ±20%
    const jitter = base * (0.8 + Math.random() * 0.4);
    await new Promise(r => setTimeout(r, Math.round(jitter)));
  }

  // Retry wrapper with exponential backoff
  async withRetry(fn) {
    let lastError;
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          // Exponential backoff: 1s, 2s, 4s...
          const backoff = Math.pow(2, attempt - 1) * 1000;
          await new Promise(r => setTimeout(r, backoff));
        }
        return await fn(attempt);
      } catch (err) {
        lastError = err;
        if (attempt < this.config.maxRetries) {
          continue;
        }
      }
    }
    throw lastError;
  }

  // Build fetch options with proxy support
  buildFetchOptions(headers, signal) {
    const opts = { headers, signal, redirect: 'follow' };
    // If proxy is configured in settings and HTTPS_PROXY is not already set
    if (this.config.proxy && !process.env.HTTPS_PROXY && !process.env.HTTP_PROXY) {
      process.env.HTTPS_PROXY = this.config.proxy;
      process.env.HTTP_PROXY = this.config.proxy;
    }
    return opts;
  }

  toJSON() {
    return this.config;
  }
}
