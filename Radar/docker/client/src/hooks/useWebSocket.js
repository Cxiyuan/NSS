import { useEffect, useRef, useCallback } from 'react';

export function useWebSocket(taskId, onMessage) {
  const wsRef = useRef(null);
  const onMessageRef = useRef(onMessage);
  const retryRef = useRef(0);
  const mountedRef = useRef(true);
  const intentionalCloseRef = useRef(false);
  const latestTaskIdRef = useRef(taskId);

  onMessageRef.current = onMessage;
  latestTaskIdRef.current = taskId;

  const connect = useCallback((id) => {
    if (!id || !mountedRef.current) return;

    // Stale check: if this id is no longer the latest, bail
    if (id !== latestTaskIdRef.current) return;

    const wsUrl = import.meta.env.VITE_WS_URL ||
      (location.protocol === 'https:' ? 'wss:' : 'ws:') + `//${location.host}/ws?taskId=${id}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        // Stale check on each message
        if (id !== latestTaskIdRef.current) {
          ws.close();
          return;
        }
        const data = JSON.parse(event.data);
        onMessageRef.current?.(data);
      } catch {}
    };

    ws.onerror = () => {};

    ws.onclose = () => {
      wsRef.current = null;
      if (!mountedRef.current || intentionalCloseRef.current) return;

      // Stale check: don't reconnect if taskId has changed
      if (id !== latestTaskIdRef.current) return;

      // Exponential backoff reconnection: 1s → 2s → 4s → 8s → ... → 30s max
      retryRef.current++;
      const delay = Math.min(1000 * Math.pow(2, retryRef.current - 1), 30000);
      setTimeout(() => connect(id), delay);
    };

    ws.onopen = () => {
      // Stale check: if taskId changed since connect was called, close
      if (id !== latestTaskIdRef.current) {
        ws.close();
        return;
      }
      retryRef.current = 0; // reset backoff on successful connection
    };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    retryRef.current = 0;
    intentionalCloseRef.current = false;

    if (taskId) {
      connect(taskId);
    }

    return () => {
      mountedRef.current = false;
      intentionalCloseRef.current = true;
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [taskId, connect]);

  const close = useCallback(() => {
    intentionalCloseRef.current = true;
    wsRef.current?.close();
    wsRef.current = null;
  }, []);

  return { close };
}
