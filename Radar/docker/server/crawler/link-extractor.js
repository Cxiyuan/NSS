import * as cheerio from 'cheerio';
import { resolveUrl } from '../utils/url.js';

const URL_ATTRS = ['href', 'src', 'action', 'data-url', 'data-href', 'content'];

export function extractLinks(html, baseUrl) {
  const $ = cheerio.load(html);
  const seen = new Set();
  const results = [];

  function add(url, foundOn, linkType) {
    const resolved = resolveUrl(url, baseUrl);
    if (!resolved) return;
    if (resolved.startsWith('mailto:') || resolved.startsWith('javascript:') || resolved.startsWith('data:')) return;
    if (seen.has(resolved)) return;
    seen.add(resolved);
    results.push({ url: resolved, foundOn, linkType });
  }

  // 1. DOM attributes on all elements
  $('*').each((_, el) => {
    const tag = el.tagName?.toLowerCase() || 'unknown';
    for (const attr of URL_ATTRS) {
      const val = $(el).attr(attr);
      if (val) {
        if (tag === 'meta' && attr === 'content') {
          const match = val.match(/url=([^;]+)/i);
          if (match) add(match[1].trim(), baseUrl, 'meta');
        } else {
          add(val, baseUrl, tag);
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
    if (urls) urls.forEach(u => add(u, baseUrl, 'comment'));
  }

  // 3. Script text (inline <script>)
  $('script').each((_, el) => {
    const text = $(el).html() || '';
    const quotedUrls = text.match(/["'`](https?:\/\/[^"'`]+)["'`]/g);
    if (quotedUrls) {
      quotedUrls.forEach(q => add(q.slice(1, -1), baseUrl, 'script'));
    }
    const locMatches = text.matchAll(/\blocation\.(?:href|assign|replace)\s*[=(]\s*["'`]([^"'`]+)["'`]/g);
    for (const m of locMatches) {
      add(m[1], baseUrl, 'js_dynamic');
    }
  });

  // 4. CSS url() in style tags
  $('style').each((_, el) => {
    const css = $(el).html() || '';
    const cssUrlRegex = /url\(["']?([^)"']+)["']?\)/g;
    let m;
    while ((m = cssUrlRegex.exec(css)) !== null) {
      if (m[1].startsWith('http')) add(m[1], baseUrl, 'css');
    }
  });

  return results;
}
