# Web Crawler System — Design Spec

## Overview

A full-stack JS web crawling system with a React frontend. Two operational modes:

1. **URL crawl mode** — User inputs a target website, the system deeply crawls all links (explicit and hidden), with domain/wildcard filtering, real-time progress, and PDF export.
2. **Keyword search mode** — User inputs keywords, the system uses search engine APIs (Google/Bing) to discover candidate pages, then performs deep local crawling for matching.

## Decisions

| Decision | Choice |
|----------|--------|
| Stack | Node.js + React SPA (Express monolithic server) |
| Keyword search | Search engine API + local deep crawl |
| Search engines | Google Custom Search + Bing Web Search |
| Default depth | 3 (user-adjustable) |
| Concurrency | User-adjustable worker pool |
| Hidden link extraction | Cheerio HTML parse + Puppeteer JS render |
| Real-time push | WebSocket |
| Storage | SQLite (better-sqlite3) |
| Deployment | GitHub Actions → Docker image |
| Dev workflow | Local code only; all CI builds via Actions |

## Project Structure

```
NSS/Radar/
├── server/
│   ├── index.js              # Entry: Express + WebSocket + worker pool
│   ├── routes/
│   │   ├── tasks.js          # POST /api/tasks
│   │   ├── results.js        # GET /api/tasks/:id/results
│   │   └── export.js         # GET /api/tasks/:id/export/pdf
│   ├── ws/
│   │   └── handler.js        # WebSocket message routing
│   ├── crawler/
│   │   ├── pool.js           # Worker thread pool
│   │   ├── worker.js         # Per-task crawl worker (worker_threads)
│   │   ├── fetcher.js        # HTTP + cheerio parsing
│   │   ├── browser.js        # Puppeteer headless browser
│   │   ├── link-extractor.js # Link extraction (explicit + hidden)
│   │   ├── filter.js         # Domain/wildcard filter
│   │   └── search.js         # Google + Bing search API adapter
│   ├── db/
│   │   ├── schema.js         # SQLite schema init
│   │   └── queries.js        # Query helpers
│   └── utils/
│       ├── url.js            # URL normalization, domain parsing
│       └── export-pdf.js     # PDF generation
├── client/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── pages/
│   │   │   ├── UrlCrawlPage.jsx
│   │   │   └── KeywordSearchPage.jsx
│   │   ├── components/
│   │   │   ├── TaskForm.jsx
│   │   │   ├── FilterInput.jsx
│   │   │   ├── ProgressPanel.jsx
│   │   │   ├── ResultTable.jsx
│   │   │   ├── ResultDetail.jsx
│   │   │   └── TaskHistory.jsx
│   │   ├── hooks/
│   │   │   ├── useWebSocket.js
│   │   │   └── useTaskPolling.js
│   │   └── lib/
│   │       ├── api.js
│   │       └── export.js
│   └── index.html
├── .github/workflows/
│   └── build.yml             # CI: lint → test → docker build → push
├── Dockerfile
├── package.json
└── .env.example
```

## API Design

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/tasks | Create task |
| GET | /api/tasks | List tasks (paginated) |
| GET | /api/tasks/:id | Task detail + stats |
| GET | /api/tasks/:id/results | Paginated results, `?domain=&page=&limit=` |
| POST | /api/tasks/:id/pause | Pause task |
| POST | /api/tasks/:id/resume | Resume task |
| POST | /api/tasks/:id/cancel | Cancel task |
| DELETE | /api/tasks/:id | Delete task and results |
| GET | /api/tasks/:id/export/pdf | Export results as PDF |

## WebSocket

Client connects to `ws://host/ws?taskId=xxx`. Server pushes:

```json
{ "type": "progress", "taskId": "", "crawled": 0, "total": 0, "depth": 0 }
{ "type": "result",  "taskId": "", "result": { "url", "foundOn", "linkType", "depth" } }
{ "type": "status",  "taskId": "", "status": "running|paused|completed|error" }
{ "type": "log",     "taskId": "", "level": "info|warn|error", "message": "" }
```

## Crawler Engine

### Mode 1: URL Crawl

```
Create task → enqueue seed URL → worker dequeues URL
  → fetcher (cheerio) fast HTML link parse
  → browser (Puppeteer) JS render, extract dynamic links
  → link-extractor merge + deduplicate:
      Explicit: <a href>, <link href>, <img src>, <iframe src>, <form action>
      Hidden: HTML comment URLs, <script> string URLs, window.location assignments,
              meta refresh, CSS url(), data-* attributes
  → filter: domain/wildcard match (included → skip)
  → same-domain URLs → enqueue (depth+1); external URLs → record as result
  → push result via WebSocket
  → queue empty → task complete
```

### Mode 2: Keyword Search

```
Create task → search.js calls Google/Bing API with keywords
  → result page URLs → enqueue
  → worker deep-crawls each result page, matching keywords in content
  → matched pages → record as result (with snippet context)
  → optional: continue crawling depth layers from matched pages
```

### Link Extractor Sources

- **DOM attributes**: `href`, `src`, `action`, `data-url`, `data-href`, `content`
- **HTML comments**: regex `<!--[\s\S]*?-->` then URL extraction
- **Inline scripts**: quoted `https?://` patterns, `location.href`/`location.assign`/`location.replace` assignments
- **CSS**: `url()` function values
- **Meta refresh**: `<meta http-equiv="refresh" content="...url=...">`
- **JS dynamic (Puppeteer)**: full page render, then extract all anchors + computed styles

### Filter Engine

Syntax: `qq.com` (exact), `*.qq.com` (subdomain wildcard), `*gov.cn` (suffix wildcard).
Internal conversion to regex:
- `*gov.cn` → `/.*gov\.cn$/`
- `*.qq.com` → `/[^.]+\.qq\.com$/`
- `qq.com` → `/^qq\.com$/`

Filtered links are skipped entirely (not crawled, not recorded).

## Data Model (SQLite)

```sql
CREATE TABLE tasks (
  id         TEXT PRIMARY KEY,
  type       TEXT NOT NULL,   -- 'url_crawl' | 'keyword_search'
  status     TEXT DEFAULT 'pending',
  config     TEXT NOT NULL,   -- JSON
  stats      TEXT,            -- JSON
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE results (
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

CREATE INDEX idx_results_task ON results(task_id);
CREATE INDEX idx_results_external ON results(task_id, is_external);
```

## Frontend Pages

Two pages sharing components: TaskForm, FilterInput, ProgressPanel, ResultTable, ResultDetail, TaskHistory.

- **UrlCrawlPage**: target URL input, depth/concurrency/filters config, progress bar, result table with URL/found-on/link-type/depth columns, PDF export button, task history panel
- **KeywordSearchPage**: keyword input, search engine selector (Google/Bing) + API key, depth/concurrency/filters config, matched results table with URL/matched-keywords/source-page columns

## CI/CD

```
GitHub Actions (build.yml):
  push main / PR → checkout → lint → test → docker build → docker push ghcr.io
```

**Dockerfile**: multi-stage — Stage 1 builds client with Vite, Stage 2 copies server + built client, installs Chromium for Puppeteer. Single `npm start` entry.

## Out of Scope

- Authentication / multi-user
- Robots.txt compliance (left to user discretion)
- Distributed crawling / Redis
- Scheduled/recurring tasks
