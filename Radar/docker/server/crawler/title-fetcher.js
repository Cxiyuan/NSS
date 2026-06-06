// Title fetcher — extract <title> from a URL with a short timeout.
// v1.2.QA Sprint 1 — extracted from worker.js. Includes:
//   - SSRF guard at Layer 1 (hostname) + Layer 2 (DNS resolution)
//   - Charset detection (Content-Type header + <meta> tag fallback)
//   - 6s timeout, 64KB max read (don't blow memory on huge pages)
//   - Result: { title, statusCode }
//
// This is a separate fetcher from fetchAndParse (crawler/fetcher.js)
// because title-only needs different tradeoffs: short timeout, no
// full HTML parse, no retry, no anti-detect UA rotation.

import { isBlockedHost, assertSafeHost } from '../utils/ssrf.js';

const TITLE_TIMEOUT_MS = 6000;
const MAX_TITLE_BYTES = 65536;  // 64KB
const CHARSET_ALIASES = {
  'gb2312': 'gbk',
  'gb18030': 'gb18030',
  'gbk': 'gbk',
  'utf-8': 'utf-8',
  'utf8': 'utf-8',
  'iso-8859-1': 'iso-8859-1',
  'windows-1252': 'windows-1252',
};

function detectCharset(contentType) {
  const m = contentType.match(/charset\s*=\s*["']?([^"';\s]+)/i);
  return m ? CHARSET_ALIASES[m[1].toLowerCase()] || m[1].toLowerCase() : 'utf-8';
}

function detectCharsetFromBody(bytes) {
  const head = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, 4096));
  const m = head.match(/<meta[^>]+charset\s*=\s*["']?([^"'>\s]+)/i);
  return m ? CHARSET_ALIASES[m[1].toLowerCase()] || m[1].toLowerCase() : null;
}

function tryDecode(bytes, encoding) {
  try {
    return new TextDecoder(encoding, { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  }
}

// Fetch <title> from a URL. Pure function over URL + fetch.
// Returns { title: string, statusCode: number }.
export async function fetchTitle(url, options = {}) {
  const { ssrfLookup, postWarn } = options;
  // Layer 1: cheap hostname check
  let host = '';
  try { host = new URL(url).hostname; } catch { return { title: '', statusCode: 0 }; }
  if (isBlockedHost(host)) {
    return { title: '', statusCode: 0 };
  }
  // Layer 2: DNS rebinding check (v1.2.QA A1-1)
  const safe = await assertSafeHost(host, ssrfLookup);
  if (!safe.safe) {
    if (postWarn) postWarn('warn', `SSRF guard (DNS): blocked fetchTitle ${url} (${safe.reason})`);
    return { title: '', statusCode: 0 };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TITLE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RadarCrawler/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });
    clearTimeout(timer);
    const statusCode = res.status;
    const contentType = res.headers.get('content-type') || '';
    let encoding = detectCharset(contentType);
    const reader = res.body.getReader();
    const { value, done } = await reader.read();
    reader.cancel();
    if (done && !value) return { title: '', statusCode };
    // Cap read size — don't decode huge pages just for a <title>
    const bytes = value.length > MAX_TITLE_BYTES ? value.slice(0, MAX_TITLE_BYTES) : value;
    let text = tryDecode(bytes, encoding);
    if (!contentType.match(/charset/i) && text.includes('�')) {
      const metaCharset = detectCharsetFromBody(bytes);
      if (metaCharset && metaCharset !== encoding) {
        text = tryDecode(bytes, metaCharset);
      }
    }
    if (text.includes('�')) {
      for (const enc of ['gbk', 'gb18030']) {
        if (enc !== encoding) {
          const retry = tryDecode(bytes, enc);
          if (!retry.includes('�')) { text = retry; encoding = enc; break; }
        }
      }
    }
    const match = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = match ? match[1].replace(/\s+/g, ' ').trim() : '';
    return { title, statusCode };
  } catch (err) {
    clearTimeout(timer);
    const code = err.name === 'AbortError' ? 408 : 0;
    return { title: '', statusCode: code };
  }
}

// Parallel fetcher with concurrency cap. Returns the same results array
// (mutated in place: pageTitle + statusCode set on each entry).
// Resolves with `results` after all complete (success or failure).
export async function fetchTitles(results, { concurrency = 3, ssrfLookup, postWarn } = {}) {
  const pending = new Set();
  for (const r of results) {
    if (!r || !r.url) continue;
    const p = fetchTitle(r.url, { ssrfLookup, postWarn }).then((info) => {
      r.pageTitle = info.title;
      r.statusCode = info.statusCode;
      return r;
    });
    pending.add(p);
    p.finally(() => pending.delete(p));
    if (pending.size >= concurrency) {
      await Promise.race(pending);
    }
  }
  await Promise.allSettled(pending);
  return results;
}
