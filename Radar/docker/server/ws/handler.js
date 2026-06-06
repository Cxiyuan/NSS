import { WebSocketServer } from 'ws';
import { metrics } from '../utils/metrics.js';

const HEARTBEAT_INTERVAL = 30000; // 30s

export function createWSServer(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  const subscribers = new Map();

  wss.on('connection', (ws, req) => {
    const token = process.env.RADAR_AUTH_TOKEN;
    if (token) {
      const provided = new URL(req.url, 'http://localhost').searchParams.get('token') || '';
      const protocol = (req.headers['sec-websocket-protocol'] || '').replace(/^Bearer\s+/, '');
      if (provided !== token && protocol !== token) {
        ws.close(4401, 'unauthorized');
        return;
      }
    }

    const url = new URL(req.url, 'http://localhost');
    const taskId = url.searchParams.get('taskId');

    ws.on('error', (err) => console.warn('WS error:', err.message));

    // Heartbeat: mark alive on any message or pong
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    metrics.gauge('radar_ws_connection_count', wss.clients.size);

    if (taskId) {
      if (!subscribers.has(taskId)) {
        subscribers.set(taskId, new Set());
      }
      subscribers.get(taskId).add(ws);

      ws.on('close', () => {
        metrics.gauge('radar_ws_connection_count', wss.clients.size);
        const subs = subscribers.get(taskId);
        if (subs) {
          subs.delete(ws);
          if (subs.size === 0) subscribers.delete(taskId);
        }
      });
    }
  });

  // Periodic heartbeat — ping all clients, terminate stale ones
  const heartbeatTimer = setInterval(() => {
    wss.clients.forEach(ws => {
      if (!ws.isAlive) {
        ws.terminate();
        return;
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, HEARTBEAT_INTERVAL);
  heartbeatTimer.unref(); // Don't prevent process exit during graceful shutdown

  wss.on('close', () => clearInterval(heartbeatTimer));

  function broadcast(taskId, message) {
    const subs = subscribers.get(taskId);
    if (!subs) return;
    const json = JSON.stringify(message);
    for (const ws of subs) {
      if (ws.readyState === 1) {
        ws.send(json);
      }
    }
  }

  return { wss, broadcast };
}
