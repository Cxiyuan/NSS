import * as cheerio from 'cheerio';
import { AntiDetect } from './anti-detect.js';
import { assertSafeHost } from '../utils/ssrf.js';

let antiDetect = null;

export function setAntiDetect(instance) {
  antiDetect = instance;
}

export async function fetchAndParse(url, referer = '') {
  const ad = antiDetect || new AntiDetect();
  // v1.2.QA A1-1: DNS rebinding defense — resolve hostname and check IP
  // BEFORE the actual fetch. Throws on unsafe host (fail-closed).
  let hostname = '';
  try { hostname = new URL(url).hostname; } catch { /* handled below */ }
  if (hostname) {
    const safe = await assertSafeHost(hostname);
    if (!safe.safe) {
      throw new Error(`SSRF guard: ${safe.reason}`);
    }
  }
  const headers = ad.buildHeaders(referer);
  const result = await ad.withRetry(async (attempt) => {
    const signal = AbortSignal.timeout(15000);

    let response;
    try {
      response = await fetch(url, ad.buildFetchOptions(headers, signal));
    } catch (err) {
      throw new Error(`Failed to fetch ${url}: ${err.message}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      throw new Error(`Non-HTML content type: ${contentType}`);
    }

    const html = await response.text();

    if (!response.ok) {
      // Return a result with error so caller can try Puppeteer fallback
      const $ = cheerio.load(html);
      const title = $('title').first().text().trim();
      return { html: '', title, error: `HTTP ${response.status} for ${url}` };
    }

    const $ = cheerio.load(html);
    const title = $('title').first().text().trim();
    return { html, title };
  });

  return result;
}
