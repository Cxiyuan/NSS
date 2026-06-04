// Worker message handler — extracted from index.js for testability.
// Receives `parentPort.on('message', ...)`-style events from each worker thread
// and routes them to queries / redis / wsBroadcast.
//
// wsBroadcast is read lazily (getter) to break the circular init order:
//   pool must exist before wss, but wss.broadcast is the only thing handler
//   needs at message-time. Pass `getBroadcast: () => broadcast` so the lookup
//   happens when a message actually arrives, not at construction time.

export function createWorkerMessageHandler({ queries, redis, getBroadcast }) {
  return async function handleWorkerMessage(taskId, msg) {
    const wsBroadcast = getBroadcast?.() || (() => {});
    if (msg.type === 'result' && msg.result) {
      // Write to Redis during crawl (fallback to SQLite if Redis unavailable)
      const wrote = await redis.pushResult(taskId, msg.result);
      if (!wrote) {
        // Redis unavailable — direct SQLite as fallback
        queries.insertResult(taskId, msg.result);
        const stats = queries.getTaskStats(taskId);
        queries.updateTaskStats(taskId, stats);
      }
      wsBroadcast(taskId, msg);
      return;
    }
    if (msg.type === 'result_title') {
      queries.updateResultStatus(taskId, msg.url, msg.pageTitle, msg.statusCode);
      wsBroadcast(taskId, msg);
      return;
    }
    if (msg.type === 'result_tags' && Array.isArray(msg.tags)) {
      // P1-1: persist when EITHER tags OR icp is present (footer fallback may
      // produce a valid ICP record with no risk tags). Closes the v1.0 F-1
      // broken link (tags were WS-broadcast but never saved, so reload / PDF
      // export saw empty risk).
      const icp = typeof msg.icp === 'string' ? msg.icp : '';
      if (msg.tags.length === 0 && !icp) return;
      const riskLevel = msg.riskLevel || 'suspicious';
      queries.updateResultRisk(taskId, msg.url, riskLevel, msg.tags.join(','), icp);
      wsBroadcast(taskId, msg);
      return;
    }
    if (msg.type === 'status') {
      queries.updateTaskStatus(taskId, msg.status);
      // When task reaches terminal state, flush Redis to SQLite
      if (['completed', 'error', 'cancelled'].includes(msg.status)) {
        await redis.flushToSQLite(taskId, queries);
      }
      wsBroadcast(taskId, msg);
      return;
    }
    wsBroadcast(taskId, msg);
  };
}
