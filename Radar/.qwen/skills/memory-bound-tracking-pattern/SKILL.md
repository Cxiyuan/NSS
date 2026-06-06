---
name: memory-bound-tracking-pattern
description: 使用 Set + finally 模式追踪 in-flight promises，防止 long-running tasks 中的 unbounded memory growth
source: auto-skill
extracted_at: '2026-06-06T06:50:44.667Z'
---

## 核心模式

**Pattern Name**: Set + Finally Memory-Bound Tracking

**适用场景**: Long-running tasks 中追踪 in-flight promises，防止 unbounded memory growth

## 问题背景

在 long-running tasks（如 5h+ 的爬虫任务）中，如果追踪所有 settled promises 的数组会持续增长：

```javascript
// ❌ 问题模式：Array 持续增长
let pendingTitleFetches = [];

async function processBatch(batch) {
  const results = await Promise.allSettled(batch.map(async () => {
    const titlePromise = fetchTitles(...).then(...);
    pendingTitleFetches.push(titlePromise);  // 永远不删除！
    return ...;
  }));
}
```

**后果**：
- 对于 5h+ 的任务，数组会 unbounded growth
- 持有 references 到 closed HTTP responses
- 内存泄漏

## 解决方案

**Set + Finally 模式**：

```javascript
// ✅ 正确模式：Set + finally 清理
const pendingTitleFetches = new Set();

async function processBatch(batch) {
  const titlePromise = fetchTitles(...).then(...);
  pendingTitleFetches.add(titlePromise);
  
  // 在 finally 中清理
  titlePromise.finally(() => {
    pendingTitleFetches.delete(titlePromise);
  });
  
  return ...;
}
```

## 关键特性

### 1. Set 替代 Array
- **O(1) 查找**：`Set.has()` vs `Array.includes()`
- **自动去重**：同一 promise 只存一次
- **Small Set**：max concurrency = 3，所以 max 3 entries

### 2. Snapshot 模式
```javascript
if (pendingTitleFetches.size > 0) {
  await Promise.allSettled([...pendingTitleFetches]);  // 快照
}
```
- 迭代 over a snapshot — Set 可能并发突变
- finally 回调删除 settled promises
- 快照只捕获 still-pending ones

### 3. Finally 清理
```javascript
titlePromise.finally(() => {
  pendingTitleFetches.delete(titlePromise);
});
```
- 保证 promise 结束后立即清理
- 即使 reject 也会清理

## 实际应用案例

### Case 1: Title Fetch Tracking (worker.js)
```javascript
// v1.2.QA Sprint 4 A2-7
const pendingTitleFetches = new Set();

async function run(taskConfig) {
  const pendingTitleFetches = new Set();
  
  // ...
  const titlePromise = fetchTitles(newResults, {
    concurrency: 3,
    postWarn: (level, message) => post('log', { level, message }),
  }).then(updated => {
    for (const r of updated) {
      if (r.pageTitle || r.statusCode) {
        post('result_title', { url: r.url, pageTitle: r.pageTitle, statusCode: r.statusCode });
      }
    }
  });
  
  // A2-7: track in-flight promises in a Set, drop on settle
  pendingTitleFetches.add(titlePromise);
  titlePromise.finally(() => pendingTitleFetches.delete(titlePromise));
  
  return newResults;
}

// Wait for all in-flight title fetches
if (pendingTitleFetches.size > 0) {
  await Promise.allSettled([...pendingTitleFetches]);
}
```

### Case 2: Batch Processing (worker.js)
```javascript
// v1.2.QA Sprint 1
let crawled = 0;
let filteredCount = 0;
let resultsPosted = 0;
let maxDepth = 0;
const pendingTitleFetches = new Set();

function postResult(result) {
  if (cancelled) return;
  resultsPosted++;
  post('result', { result });
}

// ...
const results = await Promise.allSettled(batch.map(async ({ url: crawlUrl, depth: currentDepth, foundOn }) => {
  // ...
  if (newResults.length > 0) {
    const titlePromise = fetchTitles(newResults, {
      concurrency: 3,
      postWarn: (level, message) => post('log', { level, message }),
    }).then(updated => {
      for (const r of updated) {
        if (r.pageTitle || r.statusCode) {
          post('result_title', { url: r.url, pageTitle: r.pageTitle, statusCode: r.statusCode });
        }
      }
    });
    pendingTitleFetches.add(titlePromise);
    titlePromise.finally(() => pendingTitleFetches.delete(titlePromise));
  }
  return newResults;
}));

// Wait for all in-flight title fetches
if (pendingTitleFetches.size > 0) {
  await Promise.allSettled([...pendingTitleFetches]);
}
```

## 性能指标建议

```javascript
// metrics.js
metrics.inc('radar_pending_fetches_total', pendingTitleFetches.size, { task_id: taskId });
metrics.gauge('radar_memory_bound_tracking', pendingTitleFetches.size, { task_id: taskId });
```

## 何时使用

✅ **适用场景**：
- Long-running tasks（> 1h）
- 异步操作追踪（fetch、API calls）
- 需要 bounded memory 的场景

❌ **不适用场景**：
- Short-lived tasks（< 1min）
- 同步操作
- 已经用 finally 清理的场景

## 相关技能

- `forward-declaration-pattern`: 解决 circular dependency
- `singleton-pattern`: 浏览器单例 TOCTOU fix
- `event-driven-architecture`: WS broadcast 模式
- `terminal-state-flush`: Redis → SQLite 持久化

## 演进历史

- **v1.0**: Array-based tracking (unbounded)
- **v1.2.QA Sprint 1**: Extracted `fetchTitles` to `title-fetcher.js`
- **v1.2.QA Sprint 4 A2-7**: Added Set + finally pattern

## 参考代码

- `docker/server/crawler/worker.js` (lines 70-130)
- `docker/server/crawler/title-fetcher.js`
