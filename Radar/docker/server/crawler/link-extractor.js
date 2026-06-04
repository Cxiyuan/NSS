// link-extractor.js — DOM link discovery with hidden-link (blacklink) detection
// v1.1: detect CSS-hidden <a> elements (display:none / visibility:hidden / 0-size / off-screen etc)

import * as cheerio from 'cheerio';
import { resolveUrl } from '../utils/url.js';
import { detectBlacklinkFromAttrs } from './blacklink-patterns.js';

const URL_ATTRS = ['href', 'src', 'action', 'data-url', 'data-href', 'content'];

// Cheerio-aware blacklink detection (used internally by extractLinks).
// Returns null if visible, or { reason: string } with the strongest signal seen.
function detectBlacklinkFlags($, el) {
  return detectBlacklinkFromAttrs({
    style: $(el).attr('style') || '',
    class: $(el).attr('class') || '',
    id:    $(el).attr('id')    || '',
  });
}

export function extractLinks(html, baseUrl) {
  const $ = cheerio.load(html);
  const seen = new Set();
  const results = [];

  function add(url, foundOn, linkType, hidden) {
    const resolved = resolveUrl(url, baseUrl);
    if (!resolved) return;
    if (resolved.startsWith('mailto:') || resolved.startsWith('javascript:') || resolved.startsWith('data:')) return;
    if (seen.has(resolved)) {
      // If we've seen this URL before but now see it as hidden, upgrade
      if (hidden) {
        const existing = results.find(r => r.url === resolved);
        if (existing && !existing.hidden) {
          existing.hidden = true;
          existing.hiddenReason = hidden.reason;
          existing.linkType = existing.linkType + '+hidden';
        }
      }
      return;
    }
    seen.add(resolved);
    results.push({ url: resolved, foundOn, linkType, hidden: hidden !== null, hiddenReason: hidden ? hidden.reason : '' });
  }

  // 1. DOM attributes on all elements
  $('*').each((_, el) => {
    const tag = el.tagName?.toLowerCase() || 'unknown';
    // Only <a> elements can be "blacklinks". img/iframe/script src are not user-clicked targets.
    const hidden = tag === 'a' ? detectBlacklinkFlags($, el) : null;

    for (const attr of URL_ATTRS) {
      const val = $(el).attr(attr);
      if (val) {
        if (tag === 'meta' && attr === 'content') {
          const match = val.match(/url=([^;]+)/i);
          if (match) add(match[1].trim(), baseUrl, 'meta', null);
        } else {
          // Only mark hidden when the href-bearing attribute is the href (not src/action)
          // (img src hidden is just a hidden image, not a blacklink)
          add(val, baseUrl, tag, attr === 'href' ? hidden : null);
        }
      }
    }
  });

  // 2. HTML comments
  const commentRegex = /<!--([\s\S]*?)-->/g;
  let match;
  const rawHtml = html;
  while ((match = commentRegex.exec(rawHtml)) !== null) {
    const urls = match[1].match(/https?:\/\/[^\s<>"']+/g);
    if (urls) urls.forEach(u => add(u, baseUrl, 'comment', null));
  }

  // 3. Script text (inline <script>)
  $('script').each((_, el) => {
    const text = $(el).html() || '';
    const quotedUrls = text.match(/["'`](https?:\/\/[^"'`]+)["'`]/g);
    if (quotedUrls) {
      quotedUrls.forEach(q => add(q.slice(1, -1), baseUrl, 'script', null));
    }
    const locMatches = text.matchAll(/\blocation\.(?:href|assign|replace)\s*[=(]\s*["'`]([^"'`]+)["'`]/g);
    for (const m of locMatches) {
      add(m[1], baseUrl, 'js_dynamic', null);
    }
  });

  // 4. CSS url() in style tags
  $('style').each((_, el) => {
    const css = $(el).html() || '';
    const cssUrlRegex = /url\(["']?([^)"']+)["']?\)/g;
    let m;
    while ((m = cssUrlRegex.exec(css)) !== null) {
      if (m[1].startsWith('http')) add(m[1], baseUrl, 'css', null);
    }
  });

  return results;
}
