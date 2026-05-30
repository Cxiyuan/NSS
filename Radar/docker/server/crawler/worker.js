import { parentPort } from 'node:worker_threads';
import { fetchAndParse } from './fetcher.js';
import { fetchWithBrowser } from './browser.js';
import { extractLinks } from './link-extractor.js';
import { FilterEngine } from './filter.js';
import { isSameDomain, getDomain, normalizeUrl } from '../utils/url.js';

let paused = false;
let cancelled = false;

parentPort.on('message', (msg) => {
  if (msg.type === 'pause') paused = true;
  if (msg.type === 'resume') paused = false;
  if (msg.type === 'cancel') cancelled = true;
});

async function run(taskConfig) {
  const { taskId, type, url, keywords, depth, concurrency, filters, searchApiKey, searchEngine: engine, searchCx } = taskConfig;

  const filter = FilterEngine.fromJSON(filters || []);
  const visited = new Set();
  const queue = [];
  let crawled = 0;

  function post(type, data) {
    if (parentPort) parentPort.postMessage({ type, taskId, ...data });
  }

  function enqueue(u, currentDepth, foundOn, skipFilter = false) {
    const normalized = normalizeUrl(u);
    if (!normalized) return;
    if (visited.has(normalized)) return;
    if (!skipFilter && filter.isFiltered(normalized)) return;
    visited.add(normalized);
    queue.push({ url: normalized, depth: currentDepth, foundOn: foundOn || '' });
  }

  // Seed URLs bypass filters — filters are for discovered links, not the target
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

    const results = await Promise.allSettled(batch.map(async ({ url: crawlUrl, depth: currentDepth, foundOn }) => {
      if (currentDepth > (depth || 3)) return [];

      let html, title;
      let usedBrowser = false; // track if Puppeteer already used as fallback
      try {
        const result = await fetchAndParse(crawlUrl);
        if (result.error) {
          // Non-2xx response — try Puppeteer fallback for WAF bypass
          post('log', { level: 'warn', message: `${result.error}, trying browser render...` });
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
        const isExt = type === 'keyword_search'
          ? !link.url.includes(getDomain(crawlUrl))
          : !isSameDomain(link.url, url);

        if (isExt) {
          newResults.push({
            url: link.url,
            foundOn: crawlUrl,
            linkType: link.linkType,
            depth: currentDepth + 1,
            isExternal: true,
          });
        } else if (currentDepth < (depth || 3)) {
          // Discovered links ARE subject to filters
          enqueue(link.url, currentDepth + 1, crawlUrl);
        }

        post('result', {
          result: {
            url: link.url,
            foundOn: crawlUrl,
            linkType: link.linkType,
            depth: currentDepth + 1,
            pageTitle: title,
          },
        });
      }

      if (type === 'keyword_search' && keywords) {
        const kwds = keywords.split(/\s+/).filter(Boolean);
        const bodyText = html.replace(/<[^>]+>/g, ' ').toLowerCase();
        const matches = kwds.filter(k => bodyText.includes(k.toLowerCase()));
        if (matches.length > 0) {
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

      return newResults;
    }));

    crawled += batch.length;
    post('progress', { crawled, total: visited.size, depth: Math.min(depth || 3, queue.length > 0 ? 1 : 0) });
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
