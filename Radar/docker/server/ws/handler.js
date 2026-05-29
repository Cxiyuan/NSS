import { WebSocketServer } from 'ws';

export function createWSServer(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

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
