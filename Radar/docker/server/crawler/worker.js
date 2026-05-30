import { parentPort } from 'node:worker_threads';
import { fetchAndParse, setAntiDetect } from './fetcher.js';

// Lightweight title fetch for external links — quick check with short timeout
async function fetchTitle(url) {
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
    // Read first 64KB to extract <title>
    const reader = res.body.getReader();
    const { value, done } = await reader.read();
    reader.cancel();
    if (done && !value) return { title: '', statusCode };
    const text = new TextDecoder('utf-8', { fatal: false }).decode(value);
    const match = text.match(/<title[^>]*>([^<]+)<\/title>/i);
    return { title: match ? match[1].trim() : '', statusCode };
  } catch (err) {
    clearTimeout(timer);
    const code = err.name === 'AbortError' ? 408 : 0;
    return { title: '', statusCode: code };
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
import { fetchWithBrowser } from './browser.js';
import { extractLinks } from './link-extractor.js';
import { FilterEngine } from './filter.js';
import { isSameDomain, getDomain, normalizeUrl } from '../utils/url.js';
import { AntiDetect } from './anti-detect.js';

let paused = false;
let cancelled = false;

parentPort.on('message', (msg) => {
  if (msg.type === 'pause') paused = true;
  if (msg.type === 'resume') paused = false;
  if (msg.type === 'cancel') cancelled = true;
});

async function run(taskConfig) {
  const { taskId, type, url, keywords, depth, concurrency, filters, searchApiKey, searchEngine: engine, searchCx, antiDetect: adConfig } = taskConfig;

  const filter = FilterEngine.fromJSON(filters || []);
  const antiDetect = new AntiDetect(adConfig || {});
  setAntiDetect(antiDetect);

  const visited = new Set();
  const queue = [];
  let crawled = 0;
  let filteredCount = 0;

  function post(type, data) {
    if (parentPort) parentPort.postMessage({ type, taskId, ...data });
  }

  // enqueue adds a URL to the crawl queue.
  // Same-domain URLs are always accepted (needed for crawl depth);
  // filter check is done separately before posting results.
  function enqueue(u, currentDepth, foundOn) {
    const normalized = normalizeUrl(u);
    if (!normalized) return false;
    if (visited.has(normalized)) return false;
    visited.add(normalized);
    queue.push({ url: normalized, depth: currentDepth, foundOn: foundOn || '' });
    return true;
  }

  if (type === 'keyword_search') {
    const { search } = await import('./search.js').then(m => m.searchEngine(engine));
    try {
      const searchResults = await search(keywords, searchApiKey, searchCx);
      post('log', { level: 'info', message: `Search returned ${searchResults.length} results` });
      for (const r of searchResults) {
        enqueue(r.url, 0, `search: ${keywords}`, true);
      }
    } catch (err) {
      post('log', { level: 'error', message: `Search API error: ${err.message}` });
      post('status', { status: 'error' });
      return;
    }
  } else {
    enqueue(url, 0, '(seed)', true);
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
      if (!usedBrowser) {
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
          if (filter.isFiltered(link.url)) {
            filteredCount++;
            post('log', { level: 'info', message: `Filtered external: ${link.url}` });
            continue;
          }
          // External links: always record, never enqueue
          newResults.push({
            url: link.url,
            foundOn: crawlUrl,
            linkType: link.linkType,
            depth: currentDepth + 1,
            isExternal: true,
          });
          post('result', {
            result: {
              url: link.url,
              foundOn: crawlUrl,
              linkType: link.linkType,
              depth: currentDepth + 1,
              pageTitle: title,
              isExternal: true,
              statusCode: 0,
            },
          });
        } else if (currentDepth < (depth || 3)) {
          // Same-domain links: enqueue for crawling depth only, never post as results
          // Result list shows only external links that passed the filter
          enqueue(link.url, currentDepth + 1, crawlUrl);
        }
      }

      if (type === 'keyword_search' && keywords) {
        const kwds = keywords.split(/\s+/).filter(Boolean);
        const bodyText = html.replace(/<[^>]+>/g, ' ').toLowerCase();
        const matches = kwds.filter(k => bodyText.includes(k.toLowerCase()));
        if (matches.length > 0) {
          // Apply filter to keyword_match results too
          if (filter.isFiltered(crawlUrl)) {
            filteredCount++;
            post('log', { level: 'info', message: `Filtered keyword_match: ${crawlUrl}` });
          } else {
            newResults.push({
              url: crawlUrl,
              foundOn,
              linkType: 'keyword_match',
              depth: currentDepth,
              isExternal: true,
              snippet: bodyText.substring(0, 300),
            });
          }
        }
      }

      // Fire-and-forget: fetch titles/status for external links in background
      if (newResults.length > 0) {
        fetchTitles(newResults).then(updated => {
          for (const r of updated) {
            if (r.pageTitle || r.statusCode) {
              post('result_title', { url: r.url, pageTitle: r.pageTitle, statusCode: r.statusCode });
            }
          }
        }).catch(() => {});
      }
      return newResults;
    }));

    crawled += batch.length;
    post('progress', { crawled, total: visited.size, depth: Math.min(depth || 3, queue.length > 0 ? 1 : 0), filtered: filteredCount });
  }

  if (cancelled) {
    post('status', { status: 'cancelled' });
  } else {
    post('status', { status: 'completed' });
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

parentPort.on('message', (msg) => {
  if (msg.type === 'start') run(msg.config);
});
