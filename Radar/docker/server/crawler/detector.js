import { ILLEGAL_PATTERNS } from './keywords.js';

const SUSPICIOUS_TLDS = new Set([
  'tk', 'ml', 'ga', 'cf', 'gq', 'xyz', 'top', 'loan',
  'work', 'click', 'download', 'review', 'stream', 'trade',
  'webcam', 'win', 'bid', 'date', 'men',
]);

function matchContent(text) {
  const tags = [];
  for (const [category, keywords] of Object.entries(ILLEGAL_PATTERNS)) {
    const matches = keywords.filter(kw => text.includes(kw));
    if (matches.length > 0) {
      tags.push(category + ':' + matches.length);
    }
  }
  return tags;
}

function checkHostReputation(hostname) {
  const tags = [];
  // Free/suspicious TLD
  const parts = hostname.split('.');
  const tld = parts[parts.length - 1];
  if (SUSPICIOUS_TLDS.has(tld)) tags.push('free-tld');
  // Bare IP address
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) tags.push('bare-ip');
  return tags;
}

// ICP cache: domain -> { icp, cachedAt }
const icpCache = new Map();
const ICP_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const ICP_CACHE_MAX_SIZE = 50000;          // v1.2 fix: 9.2.8 — cap Map size to prevent
                                          //   unbounded growth when crawling diverse sites

export async function checkICP(hostname) {
  // Check cache first
  const cached = icpCache.get(hostname);
  if (cached && Date.now() - cached.cachedAt < ICP_CACHE_TTL) {
    return cached.icp;
  }
  try {
    const baseUrl = process.env.ICP_QUERY_URL || 'http://127.0.0.1:16181';
    const res = await fetch(`${baseUrl}/query/url?search=${encodeURIComponent(hostname)}`, {
      signal: AbortSignal.timeout(5000),
      redirect: 'manual', // v1.2.QA: don't follow redirects — attacker-controlled ICP service could redirect to internal addresses
    });
    if (!res.ok) return null;
    const data = await res.json();
    const icp = data?.icp || data?.data?.icp || null;
    icpCache.set(hostname, { icp, cachedAt: Date.now() });
    // Bound the Map: when over the cap, evict the oldest entries (Map iteration
    // is insertion-order). This is the lightweight "LRU" — no per-access tracking.
    if (icpCache.size > ICP_CACHE_MAX_SIZE) {
      const toRemove = icpCache.size - ICP_CACHE_MAX_SIZE;
      let i = 0;
      for (const key of icpCache.keys()) {
        if (i++ >= toRemove) break;
        icpCache.delete(key);
      }
    }
    return icp;
  } catch {
    return null; // ICP service unavailable
  }
}

export async function detect(url, html, preTags = []) {
  // preTags: caller-supplied tags to merge in front (e.g. from link-extractor
  //          flagging a hidden link). Used for 'blacklink' category which is
  //          already detected in the DOM, not in the page text.
  const tags = [...preTags];
  try {
    const hostname = new URL(url).hostname.replace(/^\[|\]$/g, '');
    // Host reputation
    tags.push(...checkHostReputation(hostname));
    // Content analysis
    if (html) {
      const text = html.replace(/<[^>]+>/g, ' ').toLowerCase();
      tags.push(...matchContent(text));
    }
  } catch {}
  return tags;
}
