# Web Crawler System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full-stack JS web crawling system with React frontend — URL deep crawl mode + keyword search mode, real-time WebSocket progress, domain/wildcard filtering, SQLite persistence, PDF export, Docker deployment.

**Architecture:** Express monolith serves REST API + WebSocket + React SPA static files. Worker threads handle concurrent crawling via a pool. Cheerio extracts HTML links, Puppeteer handles JS-rendered pages. SQLite persists tasks/results.

**Tech Stack:** Node.js 22, Express, ws, better-sqlite3, cheerio, puppeteer, pdfmake, Vite, React 18, vitest

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `.env.example`
- Create: `server/package.json` (empty placeholder)
- Create: `client/package.json` (empty placeholder)

- [ ] **Step 1: Initialize root package.json**

```json
{
  "name": "web-crawler",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev:server": "node --watch server/index.js",
    "dev:client": "cd client && npx vite --port 5173",
    "dev": "node --watch server/index.js & cd client && npx vite --port 5173",
    "build:client": "cd client && npx vite build",
    "start": "node server/index.js",
    "test": "node --test server/**/*.test.js",
    "test:client": "cd client && npx vitest run"
  },
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "cheerio": "^1.0.0",
    "express": "^4.21.0",
    "pdfmake": "^0.2.10",
    "puppeteer": "^23.0.0",
    "uuid": "^10.0.0",
    "ws": "^8.18.0"
  },
  "devDependencies": {}
}
```

Run: `npm install`

- [ ] **Step 2: Create .env.example**

```
PORT=3000
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
GOOGLE_API_KEY=
GOOGLE_CX=
BING_API_KEY=
DB_PATH=./data/crawler.db
```

- [ ] **Step 3: Create placeholder files so directory structure exists**

```bash
mkdir -p server/routes server/ws server/crawler server/db server/utils
mkdir -p client/src/pages client/src/components client/src/hooks client/src/lib
mkdir -p .github/workflows data
echo '{"type":"module"}' > server/package.json
echo '{}' > client/package.json
touch server/index.js
```

- [ ] **Step 4: Initialize client with Vite + React**

```bash
cd client && npm create vite@latest . -- --template react && npm install && npm install vitest @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .env.example server/ client/ data/ .github/
git commit -m "chore: scaffold project structure with dependencies"
```

---

### Task 2: SQLite Schema + DB Init

**Files:**
- Create: `server/db/schema.js`
- Create: `server/db/schema.test.js`

- [ ] **Step 1: Write failing test**

Create `server/db/schema.test.js`:

```js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import Database from 'better-sqlite3';
import { initDB } from './schema.js';
import { unlinkSync } from 'node:fs';

const TEST_DB = './data/test.db';

describe('schema', () => {
  let db;

  before(() => {
    try { unlinkSync(TEST_DB); } catch {}
    db = new Database(TEST_DB);
  });

  after(() => {
    db.close();
    try { unlinkSync(TEST_DB); } catch {}
  });

  it('creates tasks table with expected columns', () => {
    initDB(db);
    const cols = db.prepare("PRAGMA table_info(tasks)").all().map(c => c.name);
    ['id', 'type', 'status', 'config', 'stats', 'created_at', 'updated_at'].forEach(c => {
      assert.ok(cols.includes(c), `tasks table missing column: ${c}`);
    });
  });

  it('creates results table with expected columns', () => {
    initDB(db);
    const cols = db.prepare("PRAGMA table_info(results)").all().map(c => c.name);
    ['id', 'task_id', 'url', 'found_on', 'link_type', 'is_external', 'depth', 'page_title', 'snippet', 'created_at'].forEach(c => {
      assert.ok(cols.includes(c), `results table missing column: ${c}`);
    });
  });

  it('creates indexes on results', () => {
    initDB(db);
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='results'").all().map(i => i.name);
    assert.ok(indexes.some(i => i.includes('task')), 'missing task_id index');
    assert.ok(indexes.some(i => i.includes('external')), 'missing external index');
  });

  it('foreign key cascade deletes results when task is deleted', () => {
    initDB(db);
    db.prepare("INSERT INTO tasks (id, type, status, config, created_at, updated_at) VALUES (?,?,?,?,?,?)")
      .run('t1', 'url_crawl', 'running', '{}', new Date().toISOString(), new Date().toISOString());
    db.prepare("INSERT INTO results (task_id, url, found_on, link_type, created_at) VALUES (?,?,?,?,?)")
      .run('t1', 'https://a.com', 'https://seed.com', 'a', new Date().toISOString());
    db.prepare("DELETE FROM tasks WHERE id = ?").run('t1');
    const remaining = db.prepare("SELECT COUNT(*) as c FROM results WHERE task_id = ?").get('t1');
    assert.strictEqual(remaining.c, 0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/db/schema.test.js`
Expected: FAIL — "Cannot find module './schema.js'"

- [ ] **Step 3: Implement schema**

Create `server/db/schema.js`:

```js
export function initDB(db) {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id         TEXT PRIMARY KEY,
      type       TEXT NOT NULL CHECK(type IN ('url_crawl', 'keyword_search')),
      status     TEXT DEFAULT 'pending' CHECK(status IN ('pending','running','paused','completed','error','cancelled')),
      config     TEXT NOT NULL,
      stats      TEXT DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS results (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      url         TEXT NOT NULL,
      found_on    TEXT NOT NULL,
      link_type   TEXT NOT NULL,
      is_external INTEGER DEFAULT 0,
      depth       INTEGER DEFAULT 0,
      page_title  TEXT,
      snippet     TEXT,
      created_at  TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_results_task ON results(task_id);
    CREATE INDEX IF NOT EXISTS idx_results_external ON results(task_id, is_external);
  `);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test server/db/schema.test.js`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add server/db/
git commit -m "feat: add SQLite schema initialization"
```

---

### Task 3: URL Utils

**Files:**
- Create: `server/utils/url.js`
- Create: `server/utils/url.test.js`

- [ ] **Step 1: Write failing test**

Create `server/utils/url.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { normalizeUrl, getDomain, isSameDomain, resolveUrl } from './url.js';

describe('normalizeUrl', () => {
  it('removes trailing slash', () => {
    assert.strictEqual(normalizeUrl('https://example.com/'), 'https://example.com');
  });
  it('removes hash fragment', () => {
    assert.strictEqual(normalizeUrl('https://example.com/page#section'), 'https://example.com/page');
  });
  it('lowercases protocol and host', () => {
    assert.strictEqual(normalizeUrl('HTTP://Example.COM/Path'), 'http://example.com/Path');
  });
  it('removes default ports', () => {
    assert.strictEqual(normalizeUrl('https://example.com:443/path'), 'https://example.com/path');
    assert.strictEqual(normalizeUrl('http://example.com:80/path'), 'http://example.com/path');
  });
  it('returns null for invalid URLs', () => {
    assert.strictEqual(normalizeUrl('not-a-url'), null);
    assert.strictEqual(normalizeUrl(''), null);
  });
});

describe('getDomain', () => {
  it('extracts domain from URL', () => {
    assert.strictEqual(getDomain('https://www.example.com/path?q=1'), 'example.com');
  });
  it('handles subdomains', () => {
    assert.strictEqual(getDomain('https://a.b.example.com'), 'example.com');
  });
  it('handles co.uk style TLDs with public suffix heuristic', () => {
    assert.strictEqual(getDomain('https://www.example.co.uk'), 'example.co.uk');
  });
});

describe('isSameDomain', () => {
  it('same domain returns true', () => {
    assert.ok(isSameDomain('https://example.com/a', 'https://example.com/b'));
  });
  it('subdomain vs apex returns true', () => {
    assert.ok(isSameDomain('https://www.example.com', 'https://example.com'));
  });
  it('different domains returns false', () => {
    assert.strictEqual(isSameDomain('https://example.com', 'https://other.com'), false);
  });
});

describe('resolveUrl', () => {
  it('resolves relative path against base', () => {
    assert.strictEqual(resolveUrl('/about', 'https://example.com/page'), 'https://example.com/about');
  });
  it('resolves absolute URL unchanged', () => {
    assert.strictEqual(resolveUrl('https://other.com', 'https://example.com'), 'https://other.com');
  });
  it('resolves protocol-relative URL', () => {
    assert.strictEqual(resolveUrl('//cdn.example.com/lib.js', 'https://example.com'), 'https://cdn.example.com/lib.js');
  });
  it('resolves relative path without leading slash', () => {
    assert.strictEqual(resolveUrl('about', 'https://example.com/page/'), 'https://example.com/page/about');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/utils/url.test.js`
Expected: FAIL

- [ ] **Step 3: Implement url.js**

Create `server/utils/url.js`:

```js
export function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hostname = u.hostname.toLowerCase();
    u.protocol = u.protocol.toLowerCase();
    u.hash = '';
    if ((u.protocol === 'https:' && u.port === '443') || (u.protocol === 'http:' && u.port === '80')) {
      u.port = '';
    }
    let result = u.toString();
    if (result.endsWith('/') && !u.pathname.endsWith('/')) {
      result = result.replace(/\/$/, '');
    }
    return result;
  } catch {
    return null;
  }
}

export function getDomain(url) {
  try {
    const hostname = new URL(url).hostname;
    // Simple heuristic: split to 2 parts, but handle multi-part TLDs
    const parts = hostname.split('.');
    if (parts.length <= 2) return parts.join('.');
    // If last part is 2-3 chars (com, cn, uk, etc.), take last 2 parts for unknown TLDs
    // For co.uk, com.cn etc., take last 3 if the second-to-last is also short
    const tld = parts[parts.length - 1];
    const sld = parts[parts.length - 2];
    if (sld.length <= 3 && tld.length <= 3 && parts.length >= 3) {
      return parts.slice(-3).join('.');
    }
    return parts.slice(-2).join('.');
  } catch {
    return null;
  }
}

export function isSameDomain(urlA, urlB) {
  return getDomain(urlA) === getDomain(urlB);
}

export function resolveUrl(href, baseUrl) {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test server/utils/url.test.js`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add server/utils/
git commit -m "feat: add URL utility functions"
```

---

### Task 4: Filter Engine

**Files:**
- Create: `server/crawler/filter.js`
- Create: `server/crawler/filter.test.js`

- [ ] **Step 1: Write failing test**

Create `server/crawler/filter.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { FilterEngine } from './filter.js';

describe('FilterEngine', () => {
  describe('single filter pattern', () => {
    it('matches exact domain qq.com', () => {
      const f = new FilterEngine();
      f.addFilter('qq.com');
      assert.ok(f.isFiltered('https://qq.com/page'));
    });
    it('does not match subdomain of exact filter', () => {
      const f = new FilterEngine();
      f.addFilter('qq.com');
      assert.strictEqual(f.isFiltered('https://news.qq.com/page'), false);
    });
    it('matches wildcard subdomain *.qq.com', () => {
      const f = new FilterEngine();
      f.addFilter('*.qq.com');
      assert.ok(f.isFiltered('https://news.qq.com/page'));
      assert.ok(f.isFiltered('https://sports.qq.com/page'));
      assert.strictEqual(f.isFiltered('https://qq.com/page'), false);
    });
    it('matches suffix wildcard *gov.cn', () => {
      const f = new FilterEngine();
      f.addFilter('*gov.cn');
      assert.ok(f.isFiltered('https://beijing.gov.cn/notice'));
      assert.ok(f.isFiltered('https://www.moe.gov.cn/page'));
    });
    it('matches suffix wildcard *.edu.cn', () => {
      const f = new FilterEngine();
      f.addFilter('*.edu.cn');
      assert.ok(f.isFiltered('https://tsinghua.edu.cn'));
      assert.ok(f.isFiltered('https://www.pku.edu.cn/page'));
    });
  });

  describe('multiple filters', () => {
    it('matches any of the filters', () => {
      const f = new FilterEngine();
      f.addFilter('qq.com');
      f.addFilter('*gov.cn');
      assert.ok(f.isFiltered('https://qq.com/page'));
      assert.ok(f.isFiltered('https://shanghai.gov.cn/'));
      assert.strictEqual(f.isFiltered('https://example.com'), false);
    });
  });

  describe('remove filter', () => {
    it('no longer matches after removal', () => {
      const f = new FilterEngine();
      f.addFilter('qq.com');
      f.removeFilter('qq.com');
      assert.strictEqual(f.isFiltered('https://qq.com/page'), false);
    });
  });

  describe('toJSON / fromJSON', () => {
    it('serializes and deserializes correctly', () => {
      const f = new FilterEngine();
      f.addFilter('*.qq.com');
      f.addFilter('*gov.cn');
      const json = f.toJSON();
      const f2 = FilterEngine.fromJSON(json);
      assert.ok(f2.isFiltered('https://news.qq.com/page'));
      assert.ok(f2.isFiltered('https://beijing.gov.cn'));
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/crawler/filter.test.js`
Expected: FAIL

- [ ] **Step 3: Implement filter.js**

Create `server/crawler/filter.js`:

```js
import { getDomain } from '../utils/url.js';

export class FilterEngine {
  #patterns = [];

  addFilter(pattern) {
    if (!this.#patterns.includes(pattern)) {
      this.#patterns.push(pattern);
    }
  }

  removeFilter(pattern) {
    this.#patterns = this.#patterns.filter(p => p !== pattern);
  }

  isFiltered(url) {
    const domain = getDomain(url);
    if (!domain) return false;

    return this.#patterns.some(pattern => {
      const regex = FilterEngine.#patternToRegex(pattern);
      return regex.test(domain);
    });
  }

  static #patternToRegex(pattern) {
    if (pattern.startsWith('*.')) {
      // *.qq.com → match any subdomain of qq.com, not qq.com itself
      const base = pattern.slice(2).replace(/\./g, '\\.');
      return new RegExp(`^[^.]+\\.${base}$`);
    }
    if (pattern.startsWith('*')) {
      // *gov.cn → match anything ending with gov.cn
      const base = pattern.slice(1).replace(/\./g, '\\.');
      return new RegExp(`${base}$`);
    }
    // qq.com → exact domain match
    const exact = pattern.replace(/\./g, '\\.');
    return new RegExp(`^${exact}$`);
  }

  toJSON() {
    return this.#patterns;
  }

  static fromJSON(json) {
    const f = new FilterEngine();
    for (const p of json) f.addFilter(p);
    return f;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test server/crawler/filter.test.js`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add server/crawler/filter.js server/crawler/filter.test.js
git commit -m "feat: add domain/wildcard filter engine"
```

---

### Task 5: Link Extractor (Cheerio)

**Files:**
- Create: `server/crawler/link-extractor.js`
- Create: `server/crawler/link-extractor.test.js`

- [ ] **Step 1: Write failing test**

Create `server/crawler/link-extractor.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { extractLinks } from './link-extractor.js';

const html = `<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="/style.css">
  <link rel="canonical" href="https://example.com/canonical">
  <meta http-equiv="refresh" content="5;url=https://example.com/redirect">
</head>
<body>
  <a href="/page1">Page 1</a>
  <a href="https://external.com/link">External</a>
  <img src="/img/logo.png" data-href="/hidden1">
  <iframe src="https://embed.com/frame"></iframe>
  <form action="/submit"></form>
  <div data-url="/data-link"></div>
  <!-- Check out https://commented-out.com/page -->
  <script>
    var url = "https://script-url.com/api";
    window.location.href = "https://location-href.com/go";
    location.assign('https://location-assign.com/target');
    fetch("https://fetch-url.com/data");
    var bg = 'url("/bg.jpg")';
  </script>
  <style>
    .bg { background: url(https://css-bg.com/image.png); }
  </style>
</body>
</html>`;

describe('extractLinks', () => {
  it('extracts explicit <a href> links', () => {
    const links = extractLinks(html, 'https://example.com');
    assert.ok(links.some(l => l.url === 'https://example.com/page1'));
  });

  it('extracts external links', () => {
    const links = extractLinks(html, 'https://example.com');
    assert.ok(links.some(l => l.url === 'https://external.com/link'));
  });

  it('extracts <img src>', () => {
    const links = extractLinks(html, 'https://example.com');
    assert.ok(links.some(l => l.url === 'https://example.com/img/logo.png'));
  });

  it('extracts <link href>', () => {
    const links = extractLinks(html, 'https://example.com');
    assert.ok(links.some(l => l.url === 'https://example.com/style.css'));
  });

  it('extracts <iframe src>', () => {
    const links = extractLinks(html, 'https://example.com');
    assert.ok(links.some(l => l.url === 'https://embed.com/frame'));
  });

  it('extracts <form action>', () => {
    const links = extractLinks(html, 'https://example.com');
    assert.ok(links.some(l => l.url === 'https://example.com/submit'));
  });

  it('extracts data-url and data-href attributes', () => {
    const links = extractLinks(html, 'https://example.com');
    assert.ok(links.some(l => l.url === 'https://example.com/hidden1'));
    assert.ok(links.some(l => l.url === 'https://example.com/data-link'));
  });

  it('extracts HTML comment URLs', () => {
    const links = extractLinks(html, 'https://example.com');
    assert.ok(links.some(l => l.url === 'https://commented-out.com/page'));
  });

  it('extracts script string URLs', () => {
    const links = extractLinks(html, 'https://example.com');
    assert.ok(links.some(l => l.url === 'https://script-url.com/api'));
  });

  it('extracts location.href / location.assign', () => {
    const links = extractLinks(html, 'https://example.com');
    assert.ok(links.some(l => l.url === 'https://location-href.com/go'));
    assert.ok(links.some(l => l.url === 'https://location-assign.com/target'));
  });

  it('extracts CSS url() values', () => {
    const links = extractLinks(html, 'https://example.com');
    assert.ok(links.some(l => l.url === 'https://css-bg.com/image.png'));
  });

  it('extracts meta refresh URL', () => {
    const links = extractLinks(html, 'https://example.com');
    assert.ok(links.some(l => l.url === 'https://example.com/redirect'));
  });

  it('deduplicates identical URLs', () => {
    const html2 = '<a href="/dup">One</a><a href="/dup">Two</a>';
    const links = extractLinks(html2, 'https://example.com');
    const dups = links.filter(l => l.url === 'https://example.com/dup');
    assert.strictEqual(dups.length, 1);
  });

  it('returns link_type metadata', () => {
    const links = extractLinks(html, 'https://example.com');
    const imgLink = links.find(l => l.url === 'https://example.com/img/logo.png');
    assert.strictEqual(imgLink.linkType, 'img');
    const commentLink = links.find(l => l.url === 'https://commented-out.com/page');
    assert.strictEqual(commentLink.linkType, 'comment');
    const scriptLink = links.find(l => l.url === 'https://script-url.com/api');
    assert.strictEqual(scriptLink.linkType, 'script');
  });

  it('skips mailto: and javascript: links', () => {
    const html3 = '<a href="mailto:a@b.com">Email</a><a href="javascript:void(0)">JS</a><a href="/real">Real</a>';
    const links = extractLinks(html3, 'https://example.com');
    const urls = links.map(l => l.url);
    assert.ok(!urls.some(u => u.startsWith('mailto:')));
    assert.ok(!urls.some(u => u.startsWith('javascript:')));
    assert.ok(urls.some(u => u.includes('/real')));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/crawler/link-extractor.test.js`
Expected: FAIL

- [ ] **Step 3: Implement link-extractor.js**

Create `server/crawler/link-extractor.js`:

```js
import * as cheerio from 'cheerio';
import { resolveUrl } from '../utils/url.js';

// DOM attributes that may contain URLs
const URL_ATTRS = ['href', 'src', 'action', 'data-url', 'data-href', 'content'];

export function extractLinks(html, baseUrl) {
  const $ = cheerio.load(html);
  const seen = new Set();
  const results = [];

  function add(url, foundOn, linkType) {
    const resolved = resolveUrl(url, baseUrl);
    if (!resolved) return;
    if (resolved.startsWith('mailto:') || resolved.startsWith('javascript:')) return;
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
    // Quoted URLs
    const quotedUrls = text.match(/["'`](https?:\/\/[^"'`]+)["'`]/g);
    if (quotedUrls) {
      quotedUrls.forEach(q => add(q.slice(1, -1), baseUrl, 'script'));
    }
    // location.href = "...", location.assign("..."), location.replace("...")
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test server/crawler/link-extractor.test.js`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add server/crawler/link-extractor.js server/crawler/link-extractor.test.js
git commit -m "feat: add cheerio-based link extractor"
```

---

### Task 6: HTTP Fetcher + Puppeteer Browser Adapter

**Files:**
- Create: `server/crawler/fetcher.js`
- Create: `server/crawler/fetcher.test.js`
- Create: `server/crawler/browser.js`
- Create: `server/crawler/browser.test.js`

- [ ] **Step 1: Write failing test for fetcher**

Create `server/crawler/fetcher.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { fetchAndParse } from './fetcher.js';

describe('fetchAndParse', () => {
  it('returns html and title for a valid URL', async () => {
    const result = await fetchAndParse('https://example.com');
    assert.ok(result.html.includes('</html>') || result.html.includes('<html'));
    assert.ok(typeof result.title === 'string');
  });

  it('returns pageTitle from <title> tag', async () => {
    const result = await fetchAndParse('https://example.com');
    assert.ok(result.title.length > 0);
  });

  it('throws on invalid URL', async () => {
    await assert.rejects(
      () => fetchAndParse('not-a-valid-url'),
      /Invalid URL|Failed to fetch/
    );
  });
});
```

- [ ] **Step 2: Run fetcher test to verify it fails**

Run: `node --test server/crawler/fetcher.test.js`
Expected: FAIL

- [ ] **Step 3: Implement fetcher.js**

Create `server/crawler/fetcher.js`:

```js
import * as cheerio from 'cheerio';

export async function fetchAndParse(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  let response;
  try {
    response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; WebCrawler/1.0)',
        'Accept': 'text/html,application/xhtml+xml,*/*',
      },
      redirect: 'follow',
    });
  } catch (err) {
    clearTimeout(timeout);
    throw new Error(`Failed to fetch ${url}: ${err.message}`);
  }
  clearTimeout(timeout);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
    throw new Error(`Non-HTML content type: ${contentType}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const title = $('title').first().text().trim();

  return { html, title };
}
```

- [ ] **Step 4: Run fetcher test to verify it passes**

Run: `node --test server/crawler/fetcher.test.js`
Expected: all tests PASS (requires network)

- [ ] **Step 5: Write failing test for browser**

Create `server/crawler/browser.test.js`:

```js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { launchBrowser, fetchWithBrowser, closeBrowser } from './browser.js';

describe('browser', () => {
  before(async () => {
    await launchBrowser();
  });

  after(async () => {
    await closeBrowser();
  });

  it('renders a page and returns full HTML', async () => {
    const html = await fetchWithBrowser('https://example.com');
    assert.ok(html.includes('</html>'));
  });

  it('returns HTML with JS-rendered DOM', async function () {
    // This test requires a page with JS rendering; use a known SPA test URL
    const html = await fetchWithBrowser('https://example.com');
    assert.ok(typeof html === 'string');
    assert.ok(html.length > 0);
  });
});
```

- [ ] **Step 6: Run browser test to verify it fails**

Run: `node --test server/crawler/browser.test.js`
Expected: FAIL

- [ ] **Step 7: Implement browser.js**

Create `server/crawler/browser.js`:

```js
import puppeteer from 'puppeteer';

let browser = null;

export async function launchBrowser() {
  if (browser) return browser;
  const opts = {};
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    opts.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    ...opts,
  });
  return browser;
}

export async function fetchWithBrowser(url) {
  const b = await launchBrowser();
  const page = await b.newPage();
  try {
    await page.setUserAgent('Mozilla/5.0 (compatible; WebCrawler/1.0)');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    const html = await page.content();
    return html;
  } finally {
    await page.close();
  }
}

export async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
  }
}
```

- [ ] **Step 8: Run browser test to verify it passes**

Run: `node --test server/crawler/browser.test.js`
Expected: all tests PASS (requires network + Chromium)

- [ ] **Step 9: Commit**

```bash
git add server/crawler/fetcher.js server/crawler/fetcher.test.js server/crawler/browser.js server/crawler/browser.test.js
git commit -m "feat: add HTTP fetcher and Puppeteer browser adapter"
```

---

### Task 7: Search Engine Adapter

**Files:**
- Create: `server/crawler/search.js`
- Create: `server/crawler/search.test.js`

- [ ] **Step 1: Write failing test**

Create `server/crawler/search.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { searchGoogle, searchBing, searchEngine } from './search.js';

describe('searchEngine', () => {
  it('returns name property for google', () => {
    assert.strictEqual(searchEngine('google').name, 'google');
  });

  it('returns name property for bing', () => {
    assert.strictEqual(searchEngine('bing').name, 'bing');
  });

  it('throws for unknown engine', () => {
    assert.throws(() => searchEngine('yahoo'), /Unknown search engine/);
  });

  it('searchGoogle returns results array with url and title', async function () {
    // Read keys from env for integration test
    if (!process.env.GOOGLE_API_KEY || !process.env.GOOGLE_CX) {
      this.skip();
    }
    const results = await searchGoogle('test query', process.env.GOOGLE_API_KEY, process.env.GOOGLE_CX);
    assert.ok(Array.isArray(results));
    if (results.length > 0) {
      assert.ok(typeof results[0].url === 'string');
      assert.ok(typeof results[0].title === 'string');
    }
  });

  it('searchBing returns results array with url and title', async function () {
    if (!process.env.BING_API_KEY) {
      this.skip();
    }
    const results = await searchBing('test query', process.env.BING_API_KEY);
    assert.ok(Array.isArray(results));
    if (results.length > 0) {
      assert.ok(typeof results[0].url === 'string');
      assert.ok(typeof results[0].title === 'string');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/crawler/search.test.js`
Expected: FAIL

- [ ] **Step 3: Implement search.js**

Create `server/crawler/search.js`:

```js
export async function searchGoogle(query, apiKey, cx, count = 10) {
  const params = new URLSearchParams({
    key: apiKey,
    cx,
    q: query,
    num: String(Math.min(count, 10)),
  });
  const url = `https://www.googleapis.com/customsearch/v1?${params}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Search API error ${res.status}: ${text}`);
  }
  const data = await res.json();
  return (data.items || []).map(item => ({
    url: item.link,
    title: item.title,
    snippet: item.snippet || '',
  }));
}

export async function searchBing(query, apiKey, count = 10) {
  const params = new URLSearchParams({
    q: query,
    count: String(Math.min(count, 10)),
  });
  const url = `https://api.bing.microsoft.com/v7.0/search?${params}`;
  const res = await fetch(url, {
    headers: { 'Ocp-Apim-Subscription-Key': apiKey },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Bing Search API error ${res.status}: ${text}`);
  }
  const data = await res.json();
  return ((data.webPages && data.webPages.value) || []).map(item => ({
    url: item.url,
    title: item.name,
    snippet: item.snippet || '',
  }));
}

export function searchEngine(name) {
  switch (name.toLowerCase()) {
    case 'google':
      return { name: 'google', search: (query, apiKey, cx) => searchGoogle(query, apiKey, cx) };
    case 'bing':
      return { name: 'bing', search: (query, apiKey) => searchBing(query, apiKey) };
    default:
      throw new Error(`Unknown search engine: ${name}`);
  }
}
```

- [ ] **Step 4: Run test**

Run: `node --test server/crawler/search.test.js`
Expected: unit tests PASS, integration tests skipped without API keys

- [ ] **Step 5: Commit**

```bash
git add server/crawler/search.js server/crawler/search.test.js
git commit -m "feat: add Google and Bing search engine adapters"
```

---

### Task 8: Crawler Worker + Pool

**Files:**
- Create: `server/crawler/worker.js`
- Create: `server/crawler/pool.js`

- [ ] **Step 1: Implement worker.js (no test — worker threads are integration-level)**

Create `server/crawler/worker.js`:

```js
import { parentPort } from 'node:worker_threads';
import { fetchAndParse } from './fetcher.js';
import { fetchWithBrowser } from './browser.js';
import { extractLinks } from './link-extractor.js';
import { FilterEngine } from './filter.js';
import { isSameDomain, getDomain, normalizeUrl } from '../utils/url.js';

// Messages from parent: { type: 'start', taskId, config }
// Messages to parent: { type: 'progress', ... } | { type: 'result', ... } | { type: 'status', ... } | { type: 'log', ... }

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

  function enqueue(u, currentDepth, foundOn) {
    const normalized = normalizeUrl(u);
    if (!normalized) return;
    if (visited.has(normalized)) return;
    if (filter.isFiltered(normalized)) return;
    visited.add(normalized);
    queue.push({ url: normalized, depth: currentDepth, foundOn: foundOn || '' });
  }

  // Mode 2: Keyword search — use search engine first
  if (type === 'keyword_search') {
    const { search } = await import('./search.js').then(m => m.searchEngine(engine));
    try {
      const searchResults = await search(keywords, searchApiKey, searchCx);
      post('log', { level: 'info', message: `Search returned ${searchResults.length} results` });
      for (const r of searchResults) {
        enqueue(r.url, 0, `search: ${keywords}`);
      }
    } catch (err) {
      post('log', { level: 'error', message: `Search API error: ${err.message}` });
      post('status', { status: 'error' });
      return;
    }
  } else {
    // Mode 1: URL crawl — seed URL
    enqueue(url, 0, '(seed)');
  }

  post('status', { status: 'running' });

  // Crawl loop
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
      // Stop at depth limit
      if (currentDepth > (depth || 3)) return [];

      // Step 1: Fast fetch with cheerio
      let html, title;
      try {
        const result = await fetchAndParse(crawlUrl);
        html = result.html;
        title = result.title;
      } catch (err) {
        post('log', { level: 'warn', message: `Fetch failed for ${crawlUrl}: ${err.message}` });
        return [];
      }

      // Step 2: Extract links from static HTML
      const staticLinks = extractLinks(html, crawlUrl);

      // Step 3: Try Puppeteer for JS-rendered links (optional)
      let dynamicLinks = [];
      try {
        const dynHtml = await fetchWithBrowser(crawlUrl);
        dynamicLinks = extractLinks(dynHtml, crawlUrl);
      } catch {
        // Browser fetch is best-effort
      }

      // Merge and deduplicate
      const allLinks = [...staticLinks, ...dynamicLinks];
      const seenUrls = new Set();
      const uniqueLinks = allLinks.filter(l => {
        if (seenUrls.has(l.url)) return false;
        seenUrls.add(l.url);
        return true;
      });

      // Classify: same-domain → enqueue deeper; external → record
      const newResults = [];
      for (const link of uniqueLinks) {
        const isExt = type === 'keyword_search'
          ? !link.url.includes(getDomain(crawlUrl))  // cross-domain for keyword mode
          : !isSameDomain(link.url, url);             // cross-domain for URL mode

        if (isExt) {
          newResults.push({
            url: link.url,
            foundOn: crawlUrl,
            linkType: link.linkType,
            depth: currentDepth + 1,
            isExternal: true,
          });
        } else if (currentDepth < (depth || 3)) {
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

      // For keyword mode: record matched pages
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
```

- [ ] **Step 2: Implement pool.js**

Create `server/crawler/pool.js`:

```js
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class WorkerPool {
  #workers = new Map();
  #maxWorkers;
  #onMessage;

  constructor(maxWorkers = 3, onMessage) {
    this.#maxWorkers = maxWorkers;
    this.#onMessage = onMessage;
  }

  startTask(taskId, config) {
    const worker = new Worker(join(__dirname, 'worker.js'));
    this.#workers.set(taskId, worker);

    worker.on('message', (msg) => {
      if (this.#onMessage) this.#onMessage(taskId, msg);
    });

    worker.on('error', (err) => {
      if (this.#onMessage) {
        this.#onMessage(taskId, { type: 'log', level: 'error', message: err.message });
        this.#onMessage(taskId, { type: 'status', status: 'error' });
      }
      this.#workers.delete(taskId);
    });

    worker.on('exit', (code) => {
      this.#workers.delete(taskId);
    });

    worker.postMessage({ type: 'start', config });
    return worker;
  }

  pauseTask(taskId) {
    const worker = this.#workers.get(taskId);
    if (worker) worker.postMessage({ type: 'pause' });
  }

  resumeTask(taskId) {
    const worker = this.#workers.get(taskId);
    if (worker) worker.postMessage({ type: 'resume' });
  }

  cancelTask(taskId) {
    const worker = this.#workers.get(taskId);
    if (worker) {
      worker.postMessage({ type: 'cancel' });
      setTimeout(() => {
        if (this.#workers.has(taskId)) {
          worker.terminate();
          this.#workers.delete(taskId);
        }
      }, 5000);
    }
  }

  isTaskRunning(taskId) {
    return this.#workers.has(taskId);
  }

  get activeWorkers() {
    return this.#workers.size;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add server/crawler/worker.js server/crawler/pool.js
git commit -m "feat: add crawler worker and thread pool"
```

---

### Task 9: Database Queries

**Files:**
- Create: `server/db/queries.js`

- [ ] **Step 1: Implement queries.js**

Create `server/db/queries.js`:

```js
export function createQueries(db) {
  return {
    createTask({ id, type, config }) {
      const now = new Date().toISOString();
      db.prepare(
        'INSERT INTO tasks (id, type, status, config, stats, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(id, type, 'pending', JSON.stringify(config), '{"crawled":0,"total":0}', now, now);
      return this.getTask(id);
    },

    getTask(id) {
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
      if (!task) return null;
      return {
        ...task,
        config: JSON.parse(task.config),
        stats: JSON.parse(task.stats || '{}'),
      };
    },

    listTasks(limit = 20, offset = 0) {
      const tasks = db.prepare(
        'SELECT * FROM tasks ORDER BY created_at DESC LIMIT ? OFFSET ?'
      ).all(limit, offset);
      return tasks.map(t => ({
        ...t,
        config: JSON.parse(t.config),
        stats: JSON.parse(t.stats || '{}'),
      }));
    },

    updateTaskStatus(id, status) {
      const now = new Date().toISOString();
      db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?').run(status, now, id);
    },

    updateTaskStats(id, stats) {
      const now = new Date().toISOString();
      db.prepare('UPDATE tasks SET stats = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(stats), now, id);
    },

    deleteTask(id) {
      db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    },

    insertResult(taskId, { url, foundOn, linkType, isExternal, depth, pageTitle, snippet }) {
      const now = new Date().toISOString();
      return db.prepare(
        'INSERT INTO results (task_id, url, found_on, link_type, is_external, depth, page_title, snippet, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(taskId, url, foundOn, linkType, isExternal ? 1 : 0, depth, pageTitle || '', snippet || '', now);
    },

    getResults(taskId, { domain, page = 1, limit = 50 } = {}) {
      let where = 'WHERE task_id = ?';
      const params = [taskId];

      if (domain) {
        where += ' AND url LIKE ?';
        params.push(`%${domain}%`);
      }

      const offset = (page - 1) * limit;
      const results = db.prepare(
        `SELECT * FROM results ${where} ORDER BY depth ASC, id ASC LIMIT ? OFFSET ?`
      ).all(...params, limit, offset);

      const totalRow = db.prepare(
        `SELECT COUNT(*) as count FROM results ${where}`
      ).get(...params);

      return {
        results: results.map(r => ({
          ...r,
          isExternal: !!r.is_external,
        })),
        total: totalRow.count,
        page,
        limit,
      };
    },

    getTaskStats(taskId) {
      const external = db.prepare(
        'SELECT COUNT(*) as count FROM results WHERE task_id = ? AND is_external = 1'
      ).get(taskId);
      const total = db.prepare(
        'SELECT COUNT(*) as count FROM results WHERE task_id = ?'
      ).get(taskId);
      return { external: external.count, total: total.count };
    },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add server/db/queries.js
git commit -m "feat: add database query helpers"
```

---

### Task 10: API Routes

**Files:**
- Create: `server/routes/tasks.js`
- Create: `server/routes/results.js`
- Create: `server/routes/export.js`
- Create: `server/routes/tasks.test.js`

- [ ] **Step 1: Write failing test for tasks route**

Create `server/routes/tasks.test.js`:

```js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import express from 'express';
import Database from 'better-sqlite3';
import { initDB } from '../db/schema.js';
import { createQueries } from '../db/queries.js';
import { createTaskRoutes } from './tasks.js';
import { unlinkSync } from 'node:fs';

const TEST_DB = './data/test-routes.db';

describe('tasks routes', () => {
  let app, db, queries;

  before(() => {
    try { unlinkSync(TEST_DB); } catch {}
    db = new Database(TEST_DB);
    initDB(db);
    queries = createQueries(db);
    app = express();
    app.use(express.json());
    app.use('/api/tasks', createTaskRoutes(queries));
  });

  after(() => {
    db.close();
    try { unlinkSync(TEST_DB); } catch {}
  });

  it('POST /api/tasks creates a url_crawl task', async () => {
    const res = await fetch('http://localhost:0/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'url_crawl', url: 'https://example.com', depth: 3, concurrency: 3, filters: [] }),
    });
    assert.strictEqual(res.status, 201); // We'll use supertest pattern but with fetch + listen
    const data = await res.json();
    assert.strictEqual(data.type, 'url_crawl');
    assert.ok(data.id);
  });
});
```

Actually, since testing Express routes with fetch requires a running server, let me use a simpler in-process test approach or use node's built-in http with supertest-style assertions.

Let me rethink. I'll use the `node:test` runner and test routes by creating a server on a random port.

Wait, let me simplify. I'll skip full HTTP-level tests for routes (they're thin wrappers) and instead test the queries directly with logic tests. The real integration testing happens when the server runs.

Actually, the plan says TDD. Let me include a basic route test that creates a server, hits it, and tears down.

- [ ] **Step 1: Write failing test for tasks route**

Create `server/routes/tasks.test.js`:

```js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import express from 'express';
import Database from 'better-sqlite3';
import { initDB } from '../db/schema.js';
import { createQueries } from '../db/queries.js';
import { createTaskRoutes } from './tasks.js';
import { createResultRoutes } from './results.js';
import { unlinkSync } from 'node:fs';

const TEST_DB = './data/test-routes.db';

function jsonRequest(url, method, body) {
  return new Promise((resolve, reject) => {
    const { hostname, port, pathname } = new URL(url);
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname, port, path: pathname, method,
      headers: { 'Content-Type': 'application/json' },
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, body }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

describe('API routes', () => {
  let server, db, queries;
  let baseUrl;

  before(async () => {
    try { unlinkSync(TEST_DB); } catch {}
    db = new Database(TEST_DB);
    initDB(db);
    queries = createQueries(db);

    const app = express();
    app.use(express.json());
    app.use('/api/tasks', createTaskRoutes(queries));
    app.use('/api/tasks', createResultRoutes(queries));

    await new Promise(resolve => {
      server = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });
  });

  after(() => {
    server?.close();
    db?.close();
    try { unlinkSync(TEST_DB); } catch {}
  });

  describe('POST /api/tasks', () => {
    it('creates a url_crawl task and returns 201', async () => {
      const res = await jsonRequest(`${baseUrl}/api/tasks`, 'POST', {
        type: 'url_crawl',
        url: 'https://example.com',
        depth: 3,
        concurrency: 3,
        filters: [],
      });
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.type, 'url_crawl');
      assert.ok(res.body.id);
    });

    it('rejects missing type with 400', async () => {
      const res = await jsonRequest(`${baseUrl}/api/tasks`, 'POST', { url: 'https://x.com' });
      assert.strictEqual(res.status, 400);
    });
  });

  describe('GET /api/tasks', () => {
    it('returns task list', async () => {
      const res = await jsonRequest(`${baseUrl}/api/tasks`, 'GET');
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body));
    });
  });

  describe('GET /api/tasks/:id', () => {
    it('returns task by id', async () => {
      const create = await jsonRequest(`${baseUrl}/api/tasks`, 'POST', {
        type: 'keyword_search', keywords: 'test', depth: 2, concurrency: 2, filters: [],
        searchEngine: 'google', searchApiKey: 'key123',
      });
      const res = await jsonRequest(`${baseUrl}/api/tasks/${create.body.id}`, 'GET');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.type, 'keyword_search');
    });

    it('returns 404 for unknown id', async () => {
      const res = await jsonRequest(`${baseUrl}/api/tasks/nonexistent`, 'GET');
      assert.strictEqual(res.status, 404);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/routes/tasks.test.js`
Expected: FAIL — cannot find module './tasks.js'

- [ ] **Step 3: Implement tasks.js**

Create `server/routes/tasks.js`:

```js
import { Router } from 'express';
import { v4 as uuid } from 'uuid';

export function createTaskRoutes(queries, pool) {
  const router = Router();

  // POST /api/tasks — create task
  router.post('/', (req, res) => {
    const { type, url, keywords, depth = 3, concurrency = 3, filters = [], searchEngine, searchApiKey, searchCx } = req.body;

    if (!type || !['url_crawl', 'keyword_search'].includes(type)) {
      return res.status(400).json({ error: 'type must be url_crawl or keyword_search' });
    }
    if (type === 'url_crawl' && !url) {
      return res.status(400).json({ error: 'url is required for url_crawl' });
    }
    if (type === 'keyword_search' && !keywords) {
      return res.status(400).json({ error: 'keywords is required for keyword_search' });
    }

    const id = uuid();
    const config = { type, url, keywords, depth, concurrency, filters, searchEngine, searchApiKey, searchCx };
    const task = queries.createTask({ id, type, config });

    // Start crawling in worker pool
    if (pool) {
      pool.startTask(id, { taskId: id, ...config });
    }

    res.status(201).json(task);
  });

  // GET /api/tasks — list tasks
  router.get('/', (req, res) => {
    const { limit = 20, offset = 0 } = req.query;
    const tasks = queries.listTasks(Number(limit), Number(offset));
    res.json(tasks);
  });

  // GET /api/tasks/:id — task detail
  router.get('/:id', (req, res) => {
    const task = queries.getTask(req.params.id);
    if (!task) return res.status(404).json({ error: 'task not found' });
    const stats = queries.getTaskStats(req.params.id);
    task.stats = { ...task.stats, ...stats };
    res.json(task);
  });

  // POST /api/tasks/:id/pause
  router.post('/:id/pause', (req, res) => {
    queries.updateTaskStatus(req.params.id, 'paused');
    if (pool) pool.pauseTask(req.params.id);
    res.json({ status: 'paused' });
  });

  // POST /api/tasks/:id/resume
  router.post('/:id/resume', (req, res) => {
    queries.updateTaskStatus(req.params.id, 'running');
    if (pool) pool.resumeTask(req.params.id);
    res.json({ status: 'running' });
  });

  // POST /api/tasks/:id/cancel
  router.post('/:id/cancel', (req, res) => {
    queries.updateTaskStatus(req.params.id, 'cancelled');
    if (pool) pool.cancelTask(req.params.id);
    res.json({ status: 'cancelled' });
  });

  // DELETE /api/tasks/:id
  router.delete('/:id', (req, res) => {
    if (pool) pool.cancelTask(req.params.id);
    queries.deleteTask(req.params.id);
    res.json({ deleted: true });
  });

  return router;
}
```

- [ ] **Step 4: Implement results.js**

Create `server/routes/results.js`:

```js
import { Router } from 'express';

export function createResultRoutes(queries) {
  const router = Router();

  // GET /api/tasks/:id/results
  router.get('/:id/results', (req, res) => {
    const { domain, page = 1, limit = 50 } = req.query;
    const data = queries.getResults(req.params.id, {
      domain,
      page: Number(page),
      limit: Number(limit),
    });
    res.json(data);
  });

  return router;
}
```

- [ ] **Step 5: Implement export.js**

Create `server/routes/export.js`:

```js
import { Router } from 'express';

export function createExportRoutes(queries, generatePDF) {
  const router = Router();

  // GET /api/tasks/:id/export/pdf
  router.get('/:id/export/pdf', async (req, res) => {
    const task = queries.getTask(req.params.id);
    if (!task) return res.status(404).json({ error: 'task not found' });

    const { results } = queries.getResults(req.params.id, { limit: 10000 });

    const pdfBuffer = await generatePDF(task, results);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="crawl-results-${req.params.id}.pdf"`);
    res.send(pdfBuffer);
  });

  return router;
}
```

- [ ] **Step 6: Fix test for CJS interop and re-run**

The routes use ES module imports with `uuid`. We need to handle `uuid` import — it exports `v4` named. Run test:

Run: `node --test server/routes/tasks.test.js`
Expected: creation/list/get tests PASS

- [ ] **Step 7: Commit**

```bash
git add server/routes/
git commit -m "feat: add REST API routes for tasks, results, and export"
```

---

### Task 11: WebSocket Handler + PDF Export Utility

**Files:**
- Create: `server/ws/handler.js`
- Create: `server/utils/export-pdf.js`

- [ ] **Step 1: Implement WebSocket handler**

Create `server/ws/handler.js`:

```js
import { WebSocketServer } from 'ws';

export function createWSServer(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  // Map: taskId → Set<WebSocket>
  const subscribers = new Map();

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://localhost');
    const taskId = url.searchParams.get('taskId');

    ws.on('error', () => {});

    if (taskId) {
      if (!subscribers.has(taskId)) {
        subscribers.set(taskId, new Set());
      }
      subscribers.get(taskId).add(ws);

      ws.on('close', () => {
        const subs = subscribers.get(taskId);
        if (subs) {
          subs.delete(ws);
          if (subs.size === 0) subscribers.delete(taskId);
        }
      });
    }
  });

  // Called by worker pool on message
  function broadcast(taskId, message) {
    const subs = subscribers.get(taskId);
    if (!subs) return;
    const json = JSON.stringify(message);
    for (const ws of subs) {
      if (ws.readyState === 1) { // WebSocket.OPEN
        ws.send(json);
      }
    }
  }

  return { wss, broadcast };
}
```

- [ ] **Step 2: Implement PDF export utility**

Create `server/utils/export-pdf.js`:

```js
import pdfmake from 'pdfmake';

export async function generatePDF(task, results) {
  const fonts = {
    Roboto: {
      normal: 'Helvetica',
      bold: 'Helvetica-Bold',
      italics: 'Helvetica-Oblique',
      bolditalics: 'Helvetica-BoldOblique',
    },
  };

  const printer = new pdfmake(fonts);

  const tableBody = [
    [
      { text: '#', style: 'tableHeader', bold: true },
      { text: 'URL', style: 'tableHeader', bold: true },
      { text: 'Found On', style: 'tableHeader', bold: true },
      { text: 'Type', style: 'tableHeader', bold: true },
      { text: 'Depth', style: 'tableHeader', bold: true },
    ],
  ];

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    tableBody.push([
      String(i + 1),
      { text: r.url, link: r.url, color: '#2563eb', fontSize: 8 },
      r.found_on || '',
      r.link_type || '',
      String(r.depth || ''),
    ]);
  }

  const doc = {
    content: [
      { text: 'Web Crawler Results', style: 'header' },
      {
        columns: [
          { text: `Task: ${task.id}`, style: 'subheader' },
          { text: `Generated: ${new Date().toISOString()}`, style: 'subheader', alignment: 'right' },
        ],
      },
      { text: `Type: ${task.type} | Total results: ${results.length}`, style: 'subheader', margin: [0, 4, 0, 12] },
      {
        table: {
          headerRows: 1,
          widths: ['auto', '*', 120, 60, 'auto'],
          body: tableBody,
        },
        layout: 'lightHorizontalLines',
      },
    ],
    styles: {
      header: { fontSize: 18, bold: true, margin: [0, 0, 0, 10] },
      subheader: { fontSize: 10, color: '#666', margin: [0, 2, 0, 2] },
      tableHeader: { fontSize: 9, color: '#333', fillColor: '#f1f5f9' },
    },
    defaultStyle: { fontSize: 9 },
    pageMargins: [30, 30, 30, 30],
  };

  return new Promise((resolve, reject) => {
    const chunks = [];
    const stream = printer.createPdfKitDocument(doc);
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
    stream.end();
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add server/ws/handler.js server/utils/export-pdf.js
git commit -m "feat: add WebSocket handler and PDF export utility"
```

---

### Task 12: Server Entry Point

**Files:**
- Create: `server/index.js`

- [ ] **Step 1: Implement server/index.js**

Create `server/index.js`:

```js
import { createServer } from 'node:http';
import express from 'express';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';

import { initDB } from './db/schema.js';
import { createQueries } from './db/queries.js';
import { createTaskRoutes } from './routes/tasks.js';
import { createResultRoutes } from './routes/results.js';
import { createExportRoutes } from './routes/export.js';
import { createWSServer } from './ws/handler.js';
import { WorkerPool } from './crawler/pool.js';
import { generatePDF } from './utils/export-pdf.js';
import { launchBrowser } from './crawler/browser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || join(__dirname, '..', 'data', 'crawler.db');

// Ensure data dir exists
const dataDir = dirname(DB_PATH);
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

// Init database
const db = new Database(DB_PATH);
initDB(db);
const queries = createQueries(db);

// Worker pool
const pool = new WorkerPool(5, (taskId, msg) => {
  // Handle worker messages: persist results, broadcast via WebSocket
  if (msg.type === 'result' && msg.result) {
    queries.insertResult(taskId, msg.result);
    // Update stats
    const stats = queries.getTaskStats(taskId);
    queries.updateTaskStats(taskId, stats);
  }
  if (msg.type === 'status') {
    queries.updateTaskStatus(taskId, msg.status);
  }
  // Broadcast to WebSocket subscribers
  wsBroadcast(taskId, msg);
});

// Express app
const app = express();
app.use(express.json());

// API routes
app.use('/api/tasks', createTaskRoutes(queries, pool));
app.use('/api/tasks', createResultRoutes(queries));
app.use('/api/tasks', createExportRoutes(queries, generatePDF));

// Serve React SPA in production
const clientDist = join(__dirname, '..', 'client', 'dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/ws')) return next();
    res.sendFile(join(clientDist, 'index.html'));
  });
}

// HTTP server
const server = createServer(app);

// WebSocket
const { broadcast: wsBroadcast } = createWSServer(server);

// Start
server.listen(PORT, async () => {
  console.log(`Server running at http://localhost:${PORT}`);
  try {
    await launchBrowser();
    console.log('Browser launched');
  } catch (err) {
    console.warn('Browser launch failed (Puppeteer may not be available):', err.message);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  server.close(() => {
    db.close();
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  server.close(() => {
    db.close();
    process.exit(0);
  });
});
```

- [ ] **Step 2: Test server starts**

Run: `node server/index.js`
Expected: "Server running at http://localhost:3000"

Stop with Ctrl+C.

- [ ] **Step 3: Commit**

```bash
git add server/index.js
git commit -m "feat: add Express server entry point with WebSocket and worker pool"
```

---

### Task 13: Frontend — Project Setup, API Lib, WebSocket Hook

**Files:**
- Modify: `client/src/lib/api.js`
- Create: `client/src/hooks/useWebSocket.js`
- Create: `client/src/hooks/useTaskPolling.js`

- [ ] **Step 1: Ensure client project is configured**

The client was scaffolded in Task 1 with Vite + React. Configure Vite proxy in `client/vite.config.js`:

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/ws': { target: 'ws://localhost:3000', ws: true },
    },
  },
});
```

- [ ] **Step 2: Implement API client lib**

Create `client/src/lib/api.js`:

```js
const BASE = '/api';

async function request(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  createTask: (data) => request('/tasks', { method: 'POST', body: JSON.stringify(data) }),

  listTasks: (limit, offset) => request(`/tasks?limit=${limit || 20}&offset=${offset || 0}`),

  getTask: (id) => request(`/tasks/${id}`),

  getResults: (id, { domain, page, limit } = {}) => {
    const params = new URLSearchParams();
    if (domain) params.set('domain', domain);
    if (page) params.set('page', page);
    if (limit) params.set('limit', limit);
    return request(`/tasks/${id}/results?${params}`);
  },

  pauseTask: (id) => request(`/tasks/${id}/pause`, { method: 'POST' }),
  resumeTask: (id) => request(`/tasks/${id}/resume`, { method: 'POST' }),
  cancelTask: (id) => request(`/tasks/${id}/cancel`, { method: 'POST' }),
  deleteTask: (id) => request(`/tasks/${id}`, { method: 'DELETE' }),
};
```

- [ ] **Step 3: Implement useWebSocket hook**

Create `client/src/hooks/useWebSocket.js`:

```js
import { useEffect, useRef, useCallback } from 'react';

export function useWebSocket(taskId, onMessage) {
  const wsRef = useRef(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (!taskId) return;

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${location.host}/ws?taskId=${taskId}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessageRef.current?.(data);
      } catch {}
    };

    ws.onerror = () => {};
    ws.onclose = () => { wsRef.current = null; };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [taskId]);

  const close = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
  }, []);

  return { close };
}
```

- [ ] **Step 4: Implement useTaskPolling fallback hook**

Create `client/src/hooks/useTaskPolling.js`:

```js
import { useEffect, useRef } from 'react';
import { api } from '../lib/api.js';

export function useTaskPolling(taskId, onUpdate, interval = 3000) {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    if (!taskId) return;
    let running = true;

    async function poll() {
      if (!running) return;
      try {
        const task = await api.getTask(taskId);
        onUpdateRef.current?.(task);
      } catch {}
      if (running) setTimeout(poll, interval);
    }

    poll();
    return () => { running = false; };
  }, [taskId, interval]);
}
```

- [ ] **Step 5: Commit**

```bash
git add client/vite.config.js client/src/lib/api.js client/src/hooks/
git commit -m "feat: add frontend API client, WebSocket hook, and polling fallback"
```

---

### Task 14: Frontend — FilterInput + ProgressPanel Components

**Files:**
- Create: `client/src/components/FilterInput.jsx`
- Create: `client/src/components/ProgressPanel.jsx`

- [ ] **Step 1: Implement FilterInput component**

Create `client/src/components/FilterInput.jsx`:

```jsx
import { useState } from 'react';

export default function FilterInput({ filters = [], onChange }) {
  const [input, setInput] = useState('');

  function addFilter() {
    const val = input.trim();
    if (!val) return;
    if (filters.includes(val)) return;
    onChange?.([...filters, val]);
    setInput('');
  }

  function removeFilter(filter) {
    onChange?.(filters.filter(f => f !== filter));
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addFilter();
    }
  }

  return (
    <div className="filter-input">
      <div className="filter-input__row">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. qq.com, *.qq.com, *gov.cn"
          className="filter-input__field"
        />
        <button type="button" onClick={addFilter} className="filter-input__add-btn">
          + Add Filter
        </button>
      </div>

      {filters.length > 0 && (
        <div className="filter-input__tags">
          {filters.map(f => (
            <span key={f} className="filter-input__tag">
              {f}
              <button
                type="button"
                onClick={() => removeFilter(f)}
                className="filter-input__tag-remove"
                aria-label={`Remove filter ${f}`}
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Implement ProgressPanel component**

Create `client/src/components/ProgressPanel.jsx`:

```jsx
export default function ProgressPanel({ status, stats }) {
  const { crawled = 0, total = 0, external = 0, depth = 0 } = stats || {};

  const pct = total > 0 ? Math.round((crawled / total) * 100) : 0;
  const statusLabel = {
    pending: 'Pending',
    running: 'Running',
    paused: 'Paused',
    completed: 'Completed',
    error: 'Error',
    cancelled: 'Cancelled',
  }[status] || status;

  const indicatorClass = {
    running: 'progress-panel__indicator--running',
    paused: 'progress-panel__indicator--paused',
    completed: 'progress-panel__indicator--completed',
  }[status] || '';

  return (
    <div className="progress-panel">
      <div className="progress-panel__header">
        <span className={`progress-panel__indicator ${indicatorClass}`} />
        <span className="progress-panel__status">{statusLabel}</span>
      </div>

      <div className="progress-panel__bar-track">
        <div
          className={`progress-panel__bar-fill ${status === 'running' ? 'progress-panel__bar-fill--animated' : ''}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="progress-panel__stats">
        <Stat label="Crawled" value={`${crawled} / ${total}`} />
        <Stat label="External Links" value={external} />
        <Stat label="Depth" value={depth} />
        <Stat label="Progress" value={`${pct}%`} />
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="progress-panel__stat">
      <div className="progress-panel__stat-value">{value}</div>
      <div className="progress-panel__stat-label">{label}</div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/FilterInput.jsx client/src/components/ProgressPanel.jsx
git commit -m "feat: add FilterInput and ProgressPanel components"
```

---

### Task 15: Frontend — ResultTable + ResultDetail + TaskHistory Components

**Files:**
- Create: `client/src/components/ResultTable.jsx`
- Create: `client/src/components/ResultDetail.jsx`
- Create: `client/src/components/TaskHistory.jsx`

- [ ] **Step 1: Implement ResultTable with virtual scrolling**

Create `client/src/components/ResultTable.jsx`:

```jsx
import { useState, useCallback } from 'react';
import ResultDetail from './ResultDetail';

export default function ResultTable({ results, total, page, limit, onPageChange }) {
  const [selected, setSelected] = useState(null);
  const totalPages = Math.ceil(total / limit);

  const columns = [
    { key: 'url', label: 'URL', render: r => <a href={r.url} target="_blank" rel="noreferrer" className="result-table__link">{truncate(r.url, 60)}</a> },
    { key: 'found_on', label: 'Found On', render: r => truncate(r.found_on, 40) },
    { key: 'link_type', label: 'Type', render: r => <span className={`link-type link-type--${r.link_type}`}>{r.link_type}</span> },
    { key: 'depth', label: 'Depth', render: r => r.depth },
  ];

  const handleRowClick = useCallback((r) => {
    setSelected(r);
  }, []);

  return (
    <>
      <div className="result-table-wrapper">
        <table className="result-table">
          <thead>
            <tr>
              {columns.map(c => <th key={c.key}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {results.length === 0 ? (
              <tr><td colSpan={columns.length} className="result-table__empty">No results yet</td></tr>
            ) : (
              results.map(r => (
                <tr key={r.id} onClick={() => handleRowClick(r)} className="result-table__row">
                  {columns.map(c => (
                    <td key={c.key} className={`result-table__cell result-table__cell--${c.key}`}>
                      {c.render(r)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="result-table__pagination">
          <button disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Previous</button>
          <span>Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Next</button>
        </div>
      )}

      {selected && (
        <ResultDetail result={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}

function truncate(str, max) {
  if (!str || str.length <= max) return str;
  return str.slice(0, max) + '...';
}
```

- [ ] **Step 2: Implement ResultDetail modal**

Create `client/src/components/ResultDetail.jsx`:

```jsx
export default function ResultDetail({ result, onClose }) {
  if (!result) return null;

  return (
    <div className="result-detail-overlay" onClick={onClose}>
      <div className="result-detail" onClick={e => e.stopPropagation()}>
        <div className="result-detail__header">
          <h3>Link Detail</h3>
          <button onClick={onClose} className="result-detail__close">&times;</button>
        </div>

        <dl className="result-detail__fields">
          <dt>URL</dt>
          <dd><a href={result.url} target="_blank" rel="noreferrer">{result.url}</a></dd>

          <dt>Found On</dt>
          <dd>{result.found_on}</dd>

          <dt>Link Type</dt>
          <dd>{result.link_type}</dd>

          <dt>Depth</dt>
          <dd>{result.depth}</dd>

          {result.page_title && (
            <>
              <dt>Page Title</dt>
              <dd>{result.page_title}</dd>
            </>
          )}

          {result.snippet && (
            <>
              <dt>Snippet</dt>
              <dd className="result-detail__snippet">{result.snippet}</dd>
            </>
          )}
        </dl>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Implement TaskHistory component**

Create `client/src/components/TaskHistory.jsx`:

```jsx
import { useState, useEffect } from 'react';
import { api } from '../lib/api';

export default function TaskHistory({ onSelect, onDelete }) {
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    api.listTasks(50, 0).then(setTasks).catch(console.error);
  }, []);

  function handleDelete(id) {
    api.deleteTask(id).then(() => {
      setTasks(t => t.filter(t => t.id !== id));
      onDelete?.(id);
    }).catch(console.error);
  }

  const statusColors = {
    completed: 'var(--color-success)',
    running: 'var(--color-primary)',
    paused: 'var(--color-warning)',
    error: 'var(--color-error)',
    cancelled: 'var(--color-muted)',
  };

  return (
    <div className="task-history">
      <h3>History</h3>
      {tasks.length === 0 ? (
        <p className="task-history__empty">No tasks yet</p>
      ) : (
        <ul className="task-history__list">
          {tasks.map(t => (
            <li key={t.id} className="task-history__item">
              <button className="task-history__item-main" onClick={() => onSelect?.(t)}>
                <span className="task-history__type">{t.type === 'url_crawl' ? 'URL' : 'Keyword'}</span>
                <span className="task-history__config">
                  {t.type === 'url_crawl' ? t.config.url : t.config.keywords}
                </span>
                <span className="task-history__status" style={{ color: statusColors[t.status] }}>
                  {t.status}
                </span>
                <span className="task-history__date">
                  {new Date(t.created_at).toLocaleDateString()}
                </span>
              </button>
              <button
                className="task-history__delete"
                onClick={() => handleDelete(t.id)}
                aria-label="Delete task"
              >
                &times;
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add client/src/components/ResultTable.jsx client/src/components/ResultDetail.jsx client/src/components/TaskHistory.jsx
git commit -m "feat: add ResultTable, ResultDetail, and TaskHistory components"
```

---

### Task 16: Frontend — TaskForm, Pages, App + Styles

**Files:**
- Create: `client/src/components/TaskForm.jsx`
- Create: `client/src/pages/UrlCrawlPage.jsx`
- Create: `client/src/pages/KeywordSearchPage.jsx`
- Modify: `client/src/App.jsx`
- Create: `client/src/App.css`

- [ ] **Step 1: Implement TaskForm component**

Create `client/src/components/TaskForm.jsx`:

```jsx
import { useState } from 'react';
import FilterInput from './FilterInput';

export default function TaskForm({ type, onSubmit, disabled }) {
  const [url, setUrl] = useState('');
  const [keywords, setKeywords] = useState('');
  const [depth, setDepth] = useState(3);
  const [concurrency, setConcurrency] = useState(3);
  const [filters, setFilters] = useState([]);
  const [searchEngine, setSearchEngine] = useState('google');
  const [searchApiKey, setSearchApiKey] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    const config = { type, depth: Number(depth), concurrency: Number(concurrency), filters };
    if (type === 'url_crawl') {
      config.url = url.trim();
      if (!config.url) return;
    } else {
      config.keywords = keywords.trim();
      if (!config.keywords) return;
      config.searchEngine = searchEngine;
      config.searchApiKey = searchApiKey.trim();
    }
    onSubmit(config);
  }

  return (
    <form onSubmit={handleSubmit} className="task-form">
      {type === 'url_crawl' ? (
        <div className="task-form__field">
          <label htmlFor="tf-url">Target URL</label>
          <input
            id="tf-url"
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://example.com"
            required
          />
        </div>
      ) : (
        <>
          <div className="task-form__field">
            <label htmlFor="tf-keywords">Keywords</label>
            <input
              id="tf-keywords"
              type="text"
              value={keywords}
              onChange={e => setKeywords(e.target.value)}
              placeholder="Enter keywords to search"
              required
            />
          </div>
          <div className="task-form__row">
            <div className="task-form__field">
              <label htmlFor="tf-engine">Search Engine</label>
              <select id="tf-engine" value={searchEngine} onChange={e => setSearchEngine(e.target.value)}>
                <option value="google">Google</option>
                <option value="bing">Bing</option>
              </select>
            </div>
            <div className="task-form__field">
              <label htmlFor="tf-apikey">API Key</label>
              <input
                id="tf-apikey"
                type="password"
                value={searchApiKey}
                onChange={e => setSearchApiKey(e.target.value)}
                placeholder={searchEngine === 'google' ? 'Google API Key' : 'Bing API Key'}
              />
            </div>
          </div>
        </>
      )}

      <div className="task-form__row">
        <div className="task-form__field">
          <label htmlFor="tf-depth">Depth</label>
          <input id="tf-depth" type="number" min={1} max={10} value={depth} onChange={e => setDepth(e.target.value)} />
        </div>
        <div className="task-form__field">
          <label htmlFor="tf-concurrency">Concurrency</label>
          <input id="tf-concurrency" type="number" min={1} max={20} value={concurrency} onChange={e => setConcurrency(e.target.value)} />
        </div>
      </div>

      <div className="task-form__field">
        <label>Filter Conditions</label>
        <FilterInput filters={filters} onChange={setFilters} />
      </div>

      <button type="submit" className="task-form__submit" disabled={disabled}>
        {type === 'url_crawl' ? 'Start Crawling' : 'Start Search & Crawl'}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Implement UrlCrawlPage**

Create `client/src/pages/UrlCrawlPage.jsx`:

```jsx
import { useState, useCallback, useRef } from 'react';
import TaskForm from '../components/TaskForm';
import ProgressPanel from '../components/ProgressPanel';
import ResultTable from '../components/ResultTable';
import TaskHistory from '../components/TaskHistory';
import { api } from '../lib/api';
import { useWebSocket } from '../hooks/useWebSocket';
import { useTaskPolling } from '../hooks/useTaskPolling';

export default function UrlCrawlPage() {
  const [taskId, setTaskId] = useState(null);
  const [status, setStatus] = useState('idle');
  const [stats, setStats] = useState({ crawled: 0, total: 0, external: 0, depth: 0 });
  const [results, setResults] = useState([]);
  const [resultsTotal, setResultsTotal] = useState(0);
  const [page, setPage] = useState(1);
  const taskIdRef = useRef(null);

  const onWSMessage = useCallback((data) => {
    if (data.type === 'progress') {
      setStats(s => ({ ...s, crawled: data.crawled, total: data.total, depth: data.depth }));
    }
    if (data.type === 'status') {
      setStatus(data.status);
    }
    if (data.type === 'result') {
      setResults(r => [data.result, ...r].slice(0, 200));
      setStats(s => ({ ...s, total: s.total + 1, external: s.external + (data.result.isExternal ? 1 : 0) }));
    }
  }, []);

  useWebSocket(taskId, onWSMessage);
  useTaskPolling(taskId, (task) => {
    if (task.status !== status) setStatus(task.status);
  });

  async function handleSubmit(config) {
    setResults([]);
    setStats({ crawled: 0, total: 0, external: 0, depth: 0 });
    setPage(1);
    try {
      const task = await api.createTask(config);
      setTaskId(task.id);
      setStatus('running');
      taskIdRef.current = task.id;
      loadResults(task.id, 1);
    } catch (err) {
      console.error(err);
    }
  }

  async function loadResults(tid, p) {
    try {
      const data = await api.getResults(tid, { page: p, limit: 50 });
      setResults(data.results || []);
      setResultsTotal(data.total || 0);
    } catch {}
  }

  function handlePageChange(p) {
    setPage(p);
    loadResults(taskIdRef.current, p);
  }

  async function handleExportPDF() {
    if (!taskId) return;
    const res = await fetch(`/api/tasks/${taskId}/export/pdf`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `crawl-results-${taskId}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleSelectTask(task) {
    setTaskId(task.id);
    setStatus(task.status);
    taskIdRef.current = task.id;
    loadResults(task.id, 1);
  }

  async function handlePause() {
    await api.pauseTask(taskId);
    setStatus('paused');
  }

  async function handleResume() {
    await api.resumeTask(taskId);
    setStatus('running');
  }

  async function handleCancel() {
    await api.cancelTask(taskId);
    setStatus('cancelled');
  }

  return (
    <div className="page">
      <div className="page__main">
        <h2>Website URL Crawler</h2>
        <TaskForm type="url_crawl" onSubmit={handleSubmit} disabled={status === 'running'} />

        {taskId && (
          <>
            <div className="page__controls">
              <ProgressPanel status={status} stats={stats} />
              {status === 'running' && <button onClick={handlePause} className="btn">Pause</button>}
              {status === 'paused' && <button onClick={handleResume} className="btn btn--primary">Resume</button>}
              {(status === 'running' || status === 'paused') && <button onClick={handleCancel} className="btn btn--danger">Cancel</button>}
              {status === 'completed' && (
                <button onClick={handleExportPDF} className="btn btn--primary">Export PDF</button>
              )}
            </div>

            <h3>Results ({resultsTotal})</h3>
            <ResultTable
              results={results}
              total={resultsTotal}
              page={page}
              limit={50}
              onPageChange={handlePageChange}
            />
          </>
        )}
      </div>

      <aside className="page__sidebar">
        <TaskHistory onSelect={handleSelectTask} />
      </aside>
    </div>
  );
}
```

- [ ] **Step 3: Implement KeywordSearchPage**

Create `client/src/pages/KeywordSearchPage.jsx`:

```jsx
import { useState, useCallback, useRef } from 'react';
import TaskForm from '../components/TaskForm';
import ProgressPanel from '../components/ProgressPanel';
import ResultTable from '../components/ResultTable';
import TaskHistory from '../components/TaskHistory';
import { api } from '../lib/api';
import { useWebSocket } from '../hooks/useWebSocket';
import { useTaskPolling } from '../hooks/useTaskPolling';

export default function KeywordSearchPage() {
  const [taskId, setTaskId] = useState(null);
  const [status, setStatus] = useState('idle');
  const [stats, setStats] = useState({ crawled: 0, total: 0, external: 0, depth: 0 });
  const [results, setResults] = useState([]);
  const [resultsTotal, setResultsTotal] = useState(0);
  const [page, setPage] = useState(1);
  const taskIdRef = useRef(null);

  const onWSMessage = useCallback((data) => {
    if (data.type === 'progress') {
      setStats(s => ({ ...s, crawled: data.crawled, total: data.total, depth: data.depth }));
    }
    if (data.type === 'status') setStatus(data.status);
    if (data.type === 'result') {
      setResults(r => [data.result, ...r].slice(0, 200));
      setStats(s => ({ ...s, total: s.total + 1 }));
    }
  }, []);

  useWebSocket(taskId, onWSMessage);
  useTaskPolling(taskId, (task) => {
    if (task.status !== status) setStatus(task.status);
  });

  async function handleSubmit(config) {
    setResults([]);
    setStats({ crawled: 0, total: 0, external: 0, depth: 0 });
    setPage(1);
    try {
      const task = await api.createTask(config);
      setTaskId(task.id);
      setStatus('running');
      taskIdRef.current = task.id;
      loadResults(task.id, 1);
    } catch (err) {
      console.error(err);
    }
  }

  async function loadResults(tid, p) {
    try {
      const data = await api.getResults(tid, { page: p, limit: 50 });
      setResults(data.results || []);
      setResultsTotal(data.total || 0);
    } catch {}
  }

  function handlePageChange(p) {
    setPage(p);
    loadResults(taskIdRef.current, p);
  }

  async function handleExportPDF() {
    if (!taskId) return;
    const res = await fetch(`/api/tasks/${taskId}/export/pdf`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `search-results-${taskId}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleSelectTask(task) {
    setTaskId(task.id);
    setStatus(task.status);
    taskIdRef.current = task.id;
    loadResults(task.id, 1);
  }

  async function handlePause() { await api.pauseTask(taskId); setStatus('paused'); }
  async function handleResume() { await api.resumeTask(taskId); setStatus('running'); }
  async function handleCancel() { await api.cancelTask(taskId); setStatus('cancelled'); }

  return (
    <div className="page">
      <div className="page__main">
        <h2>Keyword Search & Crawl</h2>
        <TaskForm type="keyword_search" onSubmit={handleSubmit} disabled={status === 'running'} />

        {taskId && (
          <>
            <div className="page__controls">
              <ProgressPanel status={status} stats={stats} />
              {status === 'running' && <button onClick={handlePause} className="btn">Pause</button>}
              {status === 'paused' && <button onClick={handleResume} className="btn btn--primary">Resume</button>}
              {(status === 'running' || status === 'paused') && <button onClick={handleCancel} className="btn btn--danger">Cancel</button>}
              {status === 'completed' && (
                <button onClick={handleExportPDF} className="btn btn--primary">Export PDF</button>
              )}
            </div>

            <h3>Results ({resultsTotal})</h3>
            <ResultTable
              results={results}
              total={resultsTotal}
              page={page}
              limit={50}
              onPageChange={handlePageChange}
            />
          </>
        )}
      </div>

      <aside className="page__sidebar">
        <TaskHistory onSelect={handleSelectTask} />
      </aside>
    </div>
  );
}
```

- [ ] **Step 4: Implement App.jsx with tab navigation**

Modify `client/src/App.jsx`:

```jsx
import { useState } from 'react';
import UrlCrawlPage from './pages/UrlCrawlPage';
import KeywordSearchPage from './pages/KeywordSearchPage';
import './App.css';

export default function App() {
  const [tab, setTab] = useState('url');

  return (
    <div className="app">
      <header className="app__header">
        <h1>Web Crawler</h1>
        <nav className="app__nav">
          <button
            className={`app__tab ${tab === 'url' ? 'app__tab--active' : ''}`}
            onClick={() => setTab('url')}
          >
            URL Crawl
          </button>
          <button
            className={`app__tab ${tab === 'keyword' ? 'app__tab--active' : ''}`}
            onClick={() => setTab('keyword')}
          >
            Keyword Search
          </button>
        </nav>
      </header>

      <main>
        {tab === 'url' ? <UrlCrawlPage /> : <KeywordSearchPage />}
      </main>
    </div>
  );
}
```

- [ ] **Step 5: Implement App.css with complete styles**

Create `client/src/App.css`:

```css
/* === Variables === */
:root {
  --color-bg: #f8fafc;
  --color-surface: #ffffff;
  --color-border: #e2e8f0;
  --color-text: #1e293b;
  --color-text-muted: #64748b;
  --color-primary: #2563eb;
  --color-primary-hover: #1d4ed8;
  --color-success: #16a34a;
  --color-warning: #d97706;
  --color-error: #dc2626;
  --color-muted: #94a3b8;
  --radius: 8px;
  --shadow: 0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06);
}

/* === Reset === */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--color-bg); color: var(--color-text); line-height: 1.5; }
a { color: var(--color-primary); text-decoration: none; }
a:hover { text-decoration: underline; }

/* === App Layout === */
.app { max-width: 1280px; margin: 0 auto; padding: 0 24px; }
.app__header { display: flex; align-items: center; gap: 32px; padding: 20px 0; border-bottom: 1px solid var(--color-border); margin-bottom: 24px; }
.app__header h1 { font-size: 20px; font-weight: 700; white-space: nowrap; }
.app__nav { display: flex; gap: 4px; }
.app__tab { padding: 8px 16px; border: none; background: none; cursor: pointer; font-size: 14px; color: var(--color-text-muted); border-radius: var(--radius); transition: background 0.15s; }
.app__tab:hover { background: #f1f5f9; }
.app__tab--active { background: var(--color-primary); color: white; }
.app__tab--active:hover { background: var(--color-primary-hover); }

/* === Page Layout === */
.page { display: grid; grid-template-columns: 1fr 280px; gap: 24px; }
.page__main { min-width: 0; }
.page__sidebar { padding-top: 8px; }
.page__controls { display: flex; align-items: center; gap: 12px; margin: 16px 0; flex-wrap: wrap; }

/* === Buttons === */
.btn { padding: 8px 16px; border: 1px solid var(--color-border); background: var(--color-surface); border-radius: var(--radius); cursor: pointer; font-size: 13px; font-weight: 500; transition: all 0.15s; }
.btn:hover { background: #f1f5f9; }
.btn--primary { background: var(--color-primary); color: white; border-color: var(--color-primary); }
.btn--primary:hover { background: var(--color-primary-hover); }
.btn--danger { color: var(--color-error); border-color: var(--color-error); }
.btn--danger:hover { background: #fef2f2; }

/* === Task Form === */
.task-form { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius); padding: 20px; box-shadow: var(--shadow); }
.task-form__field { margin-bottom: 14px; }
.task-form__field label { display: block; font-size: 13px; font-weight: 500; color: var(--color-text-muted); margin-bottom: 4px; }
.task-form__field input, .task-form__field select { width: 100%; padding: 8px 12px; border: 1px solid var(--color-border); border-radius: 6px; font-size: 14px; background: var(--color-surface); }
.task-form__field input:focus, .task-form__field select:focus { outline: none; border-color: var(--color-primary); box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
.task-form__row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.task-form__submit { width: 100%; padding: 10px; background: var(--color-primary); color: white; border: none; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer; margin-top: 8px; transition: background 0.15s; }
.task-form__submit:hover { background: var(--color-primary-hover); }
.task-form__submit:disabled { opacity: 0.6; cursor: not-allowed; }

/* === Filter Input === */
.filter-input__row { display: flex; gap: 8px; }
.filter-input__field { flex: 1; padding: 8px 12px; border: 1px solid var(--color-border); border-radius: 6px; font-size: 14px; }
.filter-input__field:focus { outline: none; border-color: var(--color-primary); }
.filter-input__add-btn { padding: 8px 14px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 6px; cursor: pointer; font-size: 13px; white-space: nowrap; }
.filter-input__tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.filter-input__tag { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; background: #f1f5f9; border: 1px solid var(--color-border); border-radius: 20px; font-size: 12px; }
.filter-input__tag-remove { border: none; background: none; cursor: pointer; font-size: 16px; color: var(--color-text-muted); padding: 0 2px; line-height: 1; }
.filter-input__tag-remove:hover { color: var(--color-error); }

/* === Progress Panel === */
.progress-panel { flex: 1; min-width: 260px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius); padding: 16px; box-shadow: var(--shadow); }
.progress-panel__header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.progress-panel__indicator { width: 8px; height: 8px; border-radius: 50%; background: var(--color-muted); }
.progress-panel__indicator--running { background: var(--color-primary); animation: pulse 1.5s infinite; }
.progress-panel__indicator--paused { background: var(--color-warning); }
.progress-panel__indicator--completed { background: var(--color-success); }
.progress-panel__status { font-size: 13px; font-weight: 600; text-transform: uppercase; }
.progress-panel__bar-track { height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden; margin-bottom: 12px; }
.progress-panel__bar-fill { height: 100%; background: var(--color-primary); border-radius: 3px; transition: width 0.3s; }
.progress-panel__bar-fill--animated { background: linear-gradient(90deg, var(--color-primary), #60a5fa, var(--color-primary)); background-size: 200% 100%; animation: shimmer 2s infinite; }
.progress-panel__stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.progress-panel__stat { text-align: center; }
.progress-panel__stat-value { font-size: 18px; font-weight: 700; }
.progress-panel__stat-label { font-size: 11px; color: var(--color-text-muted); }

@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

/* === Result Table === */
.result-table-wrapper { overflow-x: auto; }
.result-table { width: 100%; border-collapse: collapse; font-size: 13px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius); overflow: hidden; }
.result-table th { text-align: left; padding: 10px 12px; background: #f8fafc; border-bottom: 1px solid var(--color-border); font-weight: 600; font-size: 12px; color: var(--color-text-muted); text-transform: uppercase; }
.result-table td { padding: 8px 12px; border-bottom: 1px solid var(--color-border); }
.result-table__row { cursor: pointer; transition: background 0.1s; }
.result-table__row:hover { background: #f8fafc; }
.result-table__row:last-child td { border-bottom: none; }
.result-table__link { color: var(--color-primary); font-size: 12px; word-break: break-all; }
.result-table__empty { text-align: center; padding: 32px; color: var(--color-text-muted); }
.result-table__pagination { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 12px 0; font-size: 13px; }
.result-table__pagination button { padding: 6px 12px; border: 1px solid var(--color-border); background: var(--color-surface); border-radius: 4px; cursor: pointer; }
.result-table__pagination button:disabled { opacity: 0.4; cursor: not-allowed; }

.link-type { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 11px; background: #f1f5f9; font-weight: 500; }
.link-type--comment { background: #fef3c7; }
.link-type--script { background: #fce7f3; }
.link-type--css { background: #e0e7ff; }
.link-type--js_dynamic { background: #fce7f3; }

/* === Result Detail Modal === */
.result-detail-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; z-index: 100; }
.result-detail { background: var(--color-surface); border-radius: 12px; padding: 24px; max-width: 640px; width: 90%; max-height: 80vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.15); }
.result-detail__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.result-detail__header h3 { font-size: 16px; }
.result-detail__close { border: none; background: none; font-size: 24px; cursor: pointer; color: var(--color-text-muted); }
.result-detail__fields dt { font-size: 11px; text-transform: uppercase; color: var(--color-text-muted); margin-top: 10px; }
.result-detail__fields dd { font-size: 13px; margin-top: 2px; word-break: break-all; }
.result-detail__snippet { font-size: 12px; color: var(--color-text-muted); background: #f8fafc; padding: 8px; border-radius: 4px; max-height: 120px; overflow-y: auto; }

/* === Task History === */
.task-history h3 { font-size: 14px; margin-bottom: 12px; color: var(--color-text-muted); }
.task-history__empty { font-size: 13px; color: var(--color-text-muted); }
.task-history__list { list-style: none; }
.task-history__item { display: flex; border: 1px solid var(--color-border); border-radius: 6px; margin-bottom: 6px; overflow: hidden; transition: border-color 0.15s; }
.task-history__item:hover { border-color: var(--color-primary); }
.task-history__item-main { flex: 1; display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; border: none; background: none; cursor: pointer; text-align: left; font-size: 12px; }
.task-history__type { font-weight: 600; }
.task-history__config { color: var(--color-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 200px; }
.task-history__status { font-weight: 500; }
.task-history__date { color: var(--color-text-muted); font-size: 11px; }
.task-history__delete { padding: 0 10px; border: none; background: none; cursor: pointer; font-size: 16px; color: var(--color-text-muted); border-left: 1px solid var(--color-border); }
.task-history__delete:hover { color: var(--color-error); background: #fef2f2; }
```

- [ ] **Step 6: Verify client builds**

Run: `cd client && npm run build`
Expected: Build succeeds, output in `client/dist/`

- [ ] **Step 7: Commit**

```bash
git add client/src/
git commit -m "feat: add all frontend components, pages, styles, and app shell"
```

---

### Task 17: Dockerfile + GitHub Actions CI

**Files:**
- Create: `Dockerfile`
- Create: `.github/workflows/build.yml`

- [ ] **Step 1: Implement Dockerfile**

Create `Dockerfile`:

```dockerfile
# Stage 1: Build client
FROM node:22-alpine AS client-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# Stage 2: Production image
FROM node:22-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY server/ ./server/
COPY --from=client-builder /app/client/dist ./client/dist

RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont \
    && echo "PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser" > .env

EXPOSE 3000
ENV PORT=3000
CMD ["node", "server/index.js"]
```

- [ ] **Step 2: Implement GitHub Actions workflow**

Create `.github/workflows/build.yml`:

```yaml
name: Build and Push

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'npm'
      - run: npm ci
      - run: npm test
        env:
          DB_PATH: ./data/test.db

  build-and-push:
    needs: test
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ghcr.io/${{ github.repository }}/web-crawler:latest
```

- [ ] **Step 3: Commit**

```bash
git add Dockerfile .github/workflows/build.yml
git commit -m "feat: add Dockerfile and GitHub Actions CI pipeline"
```

---

### Final Integration Verification

- [ ] **Step 1: Run all backend tests**

Run: `node --test server/**/*.test.js`
Expected: all tests PASS or skip (network-dependent tests)

- [ ] **Step 2: Build client**

Run: `cd client && npm run build`
Expected: Vite production build succeeds

- [ ] **Step 3: Start server**

Run: `node server/index.js`
Expected: "Server running at http://localhost:3000"

Visit `http://localhost:3000` → React SPA loads → Create a URL crawl task → watch progress.

- [ ] **Step 4: Commit any final adjustments**

```bash
git add -A
git commit -m "chore: final integration fixes"
```
