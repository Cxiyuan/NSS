// Worker message handler — extracted from index.js for testability.
// Receives `parentPort.on('message', ...)`-style events from each worker thread
// and routes them to queries / redis / wsBroadcast.
//
// wsBroadcast is read lazily (getter) to break the circular init order:
//   pool must exist before wss, but wss.broadcast is the only thing handler
//   needs at message-time. Pass `getBroadcast: () => broadcast` so the lookup
//   happens when a message actually arrives, not at construction time.
//
// v1.2.QA Sprint 4: increments Prometheus metrics on each message type.

import { metrics } from './utils/metrics.js';

export function createWorkerMessageHandler({ queries, redis, getBroadcast }) {
  return async function handleWorkerMessage(taskId, msg) {
    const wsBroadcast = getBroadcast?.() || (() => {});
    if (msg.type === 'result' && msg.result) {
      metrics.inc('radar_results_total', 1, { task_id: taskId });
      // Write to Redis during crawl (fallback to SQLite if Redis unavailable)
      const wrote = await redis.pushResult(taskId, msg.result);
      if (wrote) {
        metrics.inc('radar_results_queued', 1, { task_id: taskId });
      } else {
        // Redis unavailable — direct SQLite as fallback
        queries.insertResult(taskId, msg.result);
        const stats = queries.getTaskStats(taskId);
        queries.updateTaskStats(taskId, stats);
      }
      wsBroadcast(taskId, msg);
      return;
    }
    if (msg.type === 'result_title') {
      metrics.inc('radar_result_titles_total', 1, { task_id: taskId });
      queries.updateResultStatus(taskId, msg.url, msg.pageTitle, msg.statusCode);
      wsBroadcast(taskId, msg);
      return;
    }
    if (msg.type === 'result_tags' && Array.isArray(msg.tags)) {
      metrics.inc('radar_result_tags_total', 1, { task_id: taskId });
      if (msg.icp) metrics.inc('radar_icp_detected_total', 1, { task_id: taskId });
      // P1-1: persist when EITHER tags OR icp is present (footer fallback may
      // produce a valid ICP record with no risk tags). Closes the v1.0 F-1
      // broken link (tags were WS-broadcast but never saved, so reload / PDF
      // export saw empty risk).
      const icp = typeof msg.icp === 'string' ? msg.icp : '';
      if (msg.tags.length === 0 && !icp) return;
      // v1.2.QA: ICP-only results (no risk tags) should not be flagged as suspicious.
      // Only apply riskLevel when there are actual detection tags.
      const riskLevel = msg.tags.length > 0 ? (msg.riskLevel || 'suspicious') : 'clean';
      queries.updateResultRisk(taskId, msg.url, riskLevel, msg.tags.join(','), icp);
      wsBroadcast(taskId, msg);
      return;
    }
    if (msg.type === 'status') {
      metrics.inc('radar_status_total', 1, { task_id: taskId, status: msg.status });
      queries.updateTaskStatus(taskId, msg.status);
      // When task reaches terminal state, flush Redis to SQLite
      if (['completed', 'error', 'cancelled'].includes(msg.status)) {
        await redis.flushToSQLite(taskId, queries);
      }
      wsBroadcast(taskId, msg);
      return;
    }
    metrics.inc('radar_messages_total', 1, { type: msg.type });
    wsBroadcast(taskId, msg);
  };
}
