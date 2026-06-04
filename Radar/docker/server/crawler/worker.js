import { parentPort } from 'node:worker_threads';
import { fetchAndParse, setAntiDetect } from './fetcher.js';
import { fetchWithBrowser } from './browser.js';
import { extractLinks } from './link-extractor.js';
import { FilterEngine } from './filter.js';
import { detect } from './detector.js';
import { isSameDomain, getDomain, normalizeUrl } from '../utils/url.js';
import { parseKeywords } from '../utils/keywords.js';
import { AntiDetect } from './anti-detect.js';
import { extractIcpFromHtml } from '../utils/icp-extractor.js';
import { isBlockedHost } from '../utils/ssrf.js';

// v1.2.QA: charset alias map — extracted once (was duplicated in detectCharset
// and detectCharsetFromBody). Used for Content-Type header and <meta> tag values.
const CHARSET_ALIASES = {
  'gb2312': 'gbk', 'gbk': 'gbk', 'gb18030': 'gb18030',
  'big5': 'big5', 'shift_jis': 'shift-jis', 'euc-kr': 'euc-kr',
  'euc-jp': 'euc-jp', 'iso-8859-1': 'latin1',
};

// Detect charset from Content-Type header
function detectCharset(contentType) {
  if (!contentType) return 'utf-8';
  const match = contentType.match(/charset\s*=\s*([^\s;]+)/i);
  if (!match) return 'utf-8';
  const charset = match[1].toLowerCase();
  return CHARSET_ALIASES[charset] || charset;
}

// Detect charset from raw HTML body by scanning <meta charset> tags
function detectCharsetFromBody(bytes) {
  // Try decoding as utf-8 first to find meta charset tag
  const sample = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, 4096));
  const metaMatch = sample.match(/<meta[^>]+charset\s*=\s*["']?([a-zA-Z0-9_-]+)["'\s>/]/i)
    || sample.match(/<meta[^>]+http-equiv\s*=\s*["']?Content-Type["']?[^>]+charset\s*=\s*["']?([a-zA-Z0-9_-]+)["'\s>]/i);
  if (metaMatch) {
    return CHARSET_ALIASES[metaMatch[1].toLowerCase()] || metaMatch[1].toLowerCase();
  }
  return null;
}

// Lightweight title fetch for external links — quick check with short timeout
async function fetchTitle(url) {
  // v1.2 fix: 9.2.2 — second SSRF guard, in case URL arrives from
  // somewhere other than enqueue() (e.g. external link returned by
  // search API). Defense in depth.
  let host = '';
  try { host = new URL(url).hostname; } catch { return { title: '', statusCode: 0 }; }
  if (isBlockedHost(host)) {
    return { title: '', statusCode: 0 };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
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
    // Read first 64KB to extract <title>
    const reader = res.body.getReader();
    const { value, done } = await reader.read();
    reader.cancel();
    if (done && !value) return { title: '', statusCode };

    // Try decoding; fallback chain: header charset → meta tag → utf-8
    let text = tryDecode(value, encoding);
    // If header had no charset and result has replacement chars, try meta tag
    if (!contentType.match(/charset/i) && text.includes('�')) {
      const metaCharset = detectCharsetFromBody(value);
      if (metaCharset && metaCharset !== encoding) {
        text = tryDecode(value, metaCharset);
      }
    }
    // If still garbled, try common Chinese encodings
    if (text.includes('�')) {
      for (const enc of ['gbk', 'gb18030']) {
        if (enc !== encoding) {
          const retry = tryDecode(value, enc);
          if (!retry.includes('�')) { text = retry; encoding = enc; break; }
        }
      }
    }
    // Extract title with flexible regex (handles newlines, extra whitespace)
    const match = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = match ? match[1].replace(/\s+/g, ' ').trim() : '';
    return { title, statusCode };
  } catch (err) {
    clearTimeout(timer);
    const code = err.name === 'AbortError' ? 408 : 0;
    return { title: '', statusCode: code };
  }
}

function tryDecode(bytes, encoding) {
  try {
    return new TextDecoder(encoding, { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  }
}

// Parallel title fetcher with concurrency limit
async function fetchTitles(results, concurrency = 3) {
  const pending = new Set();
  for (const r of results) {
    const p = fetchTitle(r.url).then(info => {
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

let paused = false;
let cancelled = false;
let currentFilter = null;
let currentTaskId = null;

parentPort.on('message', (msg) => {
  if (msg.type === 'pause') paused = true;
  else if (msg.type === 'resume') paused = false;
  else if (msg.type === 'cancel') cancelled = true;
  else if (msg.type === 'add_filter' && msg.pattern && currentFilter) {
    currentFilter.addFilter(msg.pattern);
    parentPort.postMessage({ type: 'log', taskId: currentTaskId, level: 'info', message: `Dynamic filter added: ${msg.pattern}` });
  }
  else if (msg.type === 'start') {
    run(msg.config).catch(err => {
      try { parentPort.postMessage({ type: 'log', level: 'error', message: `Worker fatal error: ${err.message}` }); } catch {}
      try { parentPort.postMessage({ type: 'status', status: 'error' }); } catch {}
    });
  }
});

async function run(taskConfig) {
  const { taskId, type, url, keywords, depth, concurrency, filters, antiDetect: adConfig } = taskConfig;

  const filter = FilterEngine.fromJSON(filters || []);
  currentFilter = filter;
  currentTaskId = taskId;
  const antiDetect = new AntiDetect(adConfig || {});
  setAntiDetect(antiDetect);

  const visited = new Set();
  const queue = [];
  let crawled = 0;
  let filteredCount = 0;
  let resultsPosted = 0;
  let maxDepth = 0;
  const pendingTitleFetches = [];

  function post(type, data) {
    if (parentPort) parentPort.postMessage({ type, taskId, ...data });
  }

  function postResult(result) {
    if (cancelled) return; // Don't post more results after cancel
    resultsPosted++;
    post('result', { result });
  }

  // enqueue adds a URL to the crawl queue.
  // Filter is NOT applied here — same-domain links always get crawled.
  // External links are filter-checked separately before being recorded as results.
  function enqueue(u, currentDepth, foundOn) {
    const normalized = normalizeUrl(u);
    if (!normalized) return false;
    // v1.2 fix: 9.2.2 — block enqueueing private/loopback URLs discovered in
    // crawled pages. Without this, a malicious page could trick the crawler
    // into probing 127.0.0.1, 169.254.169.254, etc.
    let host = '';
    try { host = new URL(normalized).hostname; } catch { return false; }
    if (isBlockedHost(host)) {
      post('log', { level: 'warn', message: `SSRF guard: blocked enqueue ${normalized}` });
      return false;
    }
    if (visited.has(normalized)) return false;
    visited.add(normalized);
    queue.push({ url: normalized, depth: currentDepth, foundOn: foundOn || '' });
    return true;
  }

  if (type === 'keyword_search') {
    const { search } = await import('./search.js').then(m => m.searchEngine('searxng'));
    try {
      const searchResults = await search(keywords);
      post('log', { level: 'info', message: `Search returned ${searchResults.length} results` });
      if (searchResults.length === 0) {
        post('log', { level: 'error', message: 'Search returned no results. Check keywords.' });
        post('status', { status: 'error' });
        return;
      }
      for (const r of searchResults) {
        enqueue(r.url, 0, `search: ${keywords}`);
      }
    } catch (err) {
      post('log', { level: 'error', message: `Search API error: ${err.message}` });
      post('status', { status: 'error' });
      return;
    }
  } else {
    enqueue(url, 0, '(seed)');
  }

  post('status', { status: 'running' });

  while (queue.length > 0 && !cancelled) {
    if (paused) {
      post('status', { status: 'paused' });
      await sleep(500);
      continue;
    }

    const batch = [];
    const batchSize = Math.min(concurrency || 3, queue.length);
    for (let i = 0; i < batchSize && queue.length > 0; i++) {
      batch.push(queue.shift());
    }

    // Per-URL delay is handled inside the map callback — no batch-level delay needed
    const batchDepth = Math.max(...batch.map(item => item.depth), 0);
    if (batchDepth > maxDepth) maxDepth = batchDepth;

    const results = await Promise.allSettled(batch.map(async ({ url: crawlUrl, depth: currentDepth, foundOn }) => {
      if (currentDepth > (depth || 3)) return [];

      let html, title;
      let usedBrowser = false;
      try {
        await antiDetect.delay();
        const result = await fetchAndParse(crawlUrl, foundOn);
        if (result.error) {
          post('log', { level: 'warn', message: `${result.error}, trying browser render...` });
          if (antiDetect.config.browserFallback) {
            try {
              const dynHtml = await fetchWithBrowser(crawlUrl);
              html = dynHtml;
              title = '';
              usedBrowser = true;
            } catch {
              post('log', { level: 'error', message: `Both cheerio and browser failed for ${crawlUrl}` });
              return [];
            }
          } else {
            post('log', { level: 'warn', message: `${crawlUrl}: ${result.error} (browser fallback disabled)` });
            return [];
          }
        } else {
          html = result.html;
          title = result.title;
        }
      } catch (err) {
        post('log', { level: 'warn', message: `Fetch failed for ${crawlUrl}: ${err.message}` });
        return [];
      }

      const staticLinks = extractLinks(html, crawlUrl);

      let dynamicLinks = [];
      if (!usedBrowser && antiDetect.config.browserFallback) {
        try {
          const dynHtml = await fetchWithBrowser(crawlUrl);
          dynamicLinks = extractLinks(dynHtml, crawlUrl);
        } catch {
          // Browser fetch is best-effort
        }
      }

      const allLinks = [...staticLinks, ...dynamicLinks];
      const seenUrls = new Set();
      const uniqueLinks = allLinks.filter(l => {
        if (seenUrls.has(l.url)) return false;
        seenUrls.add(l.url);
        return true;
      });

      const newResults = [];
      for (const link of uniqueLinks) {
        const isExt = !isSameDomain(link.url, type === 'keyword_search' ? crawlUrl : url);

        if (isExt) {
          // Apply filter to external links — skip if it matches a filter pattern
          if (filter.isFiltered(link.url, link.linkType)) {
            filteredCount++;
            post('log', { level: 'info', message: `Filtered external: ${link.url}` });
            continue;
          }
          // External links: always record, never enqueue
          const extResult = {
            url: link.url,
            foundOn: crawlUrl,
            linkType: link.linkType,
            depth: currentDepth + 1,
            isExternal: true,
            pageTitle: title,
            statusCode: 0,
          };
          newResults.push(extResult);
          postResult(extResult);
          // Add detection tags in background (non-blocking).
          // Pre-inject 'blacklink' tag if link-extractor flagged the <a> as hidden —
          // a CSS-hidden link is by definition a blacklink (the very definition of
          // a hidden link: visible to crawlers, invisible to humans).
          const preTags = link.hidden ? ['blacklink:1:' + (link.hiddenReason || 'css-hide')] : [];
          // P1-1: also run ICP check in parallel — try official API first, fall back
          // to footer extraction if the API is down. Footer is purely passive
          // (reads HTML only, never contacts beian.miit.gov.cn).
          const checkIcpFallback = async () => {
            let hostname;
            try { hostname = new URL(link.url).hostname.replace(/^\[|\]$/g, ''); }
            catch { return null; }
            try {
              const icp = await checkICP(hostname);
              if (icp) return icp;
            } catch { /* ICP API unavailable */ }
            // API failed — try footer
            if (html) {
              const footerResult = extractIcpFromHtml(html);
              return footerResult?.icp || null;
            }
            return null;
          };
          Promise.all([detect(link.url, html, preTags), checkIcpFallback()]).then(([tags, icp]) => {
            if (tags.length > 0 || icp) {
              post('result_tags', { url: link.url, tags, icp });
            }
          }).catch(() => { /* swallow — detection is best-effort */ });
        } else if (currentDepth < (depth || 3)) {
          // Same-domain links: enqueue for crawling depth only, never post as results
          // Result list shows only external links that passed the filter
          enqueue(link.url, currentDepth + 1, crawlUrl);
        }
      }

      if (type === 'keyword_search' && keywords) {
        // Parse keywords: quoted phrases are treated as atomic, space-separated words as individual
        const kwds = parseKeywords(keywords);
        const bodyText = html.replace(/<[^>]+>/g, ' ').toLowerCase();
        const matches = kwds.filter(k => bodyText.includes(k.toLowerCase()));
        if (matches.length > 0) {
          // Apply filter to keyword_match results too
          if (filter.isFiltered(crawlUrl, 'keyword_match')) {
            filteredCount++;
            post('log', { level: 'info', message: `Filtered keyword_match: ${crawlUrl}` });
          } else {
            const kwResult = {
              url: crawlUrl,
              foundOn,
              linkType: 'keyword_match',
              depth: currentDepth,
              isExternal: false,
              snippet: keywordSnippet(bodyText, kwds),
            };
            newResults.push(kwResult);
            postResult(kwResult);
          }
        }
      }

      // Collect title fetches — will be awaited before task completion
      if (newResults.length > 0) {
        const titlePromise = fetchTitles(newResults).then(updated => {
          for (const r of updated) {
            if (r.pageTitle || r.statusCode) {
              post('result_title', { url: r.url, pageTitle: r.pageTitle, statusCode: r.statusCode });
            }
          }
        });
        pendingTitleFetches.push(titlePromise);
      }
      return newResults;
    }));

    crawled += batch.length;
    post('progress', { crawled, total: resultsPosted, depth: maxDepth, filtered: filteredCount, visited: visited.size });
  }

  // Wait for all in-flight title fetches to finish before declaring done
  if (pendingTitleFetches.length > 0) {
    await Promise.allSettled(pendingTitleFetches);
  }

  if (cancelled) {
    post('status', { status: 'cancelled' });
  } else if (queue.length === 0) {
    // Double-check cancelled didn't fire just as the loop exited
    if (cancelled) {
      post('status', { status: 'cancelled' });
    } else {
      post('status', { status: 'completed' });
    }
  } else {
    post('status', { status: 'error', message: 'Worker stopped unexpectedly' });
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Build a snippet around the first keyword match, showing context (150 chars each side)
function keywordSnippet(bodyText, kwds) {
  const contextLen = 150;
  const maxLen = contextLen * 2;

  // Find first occurrence of any keyword
  let firstIdx = -1;
  for (const k of kwds) {
    const idx = bodyText.indexOf(k);
    if (idx !== -1 && (firstIdx === -1 || idx < firstIdx)) {
      firstIdx = idx;
    }
  }

  if (firstIdx === -1) {
    return bodyText.substring(0, maxLen);
  }

  const start = Math.max(0, firstIdx - contextLen);
  const end = Math.min(bodyText.length, firstIdx + contextLen);

  let snippet = bodyText.substring(start, end).trim();
  if (start > 0) snippet = '...' + snippet;
  if (end < bodyText.length) snippet = snippet + '...';

  return snippet;
}
