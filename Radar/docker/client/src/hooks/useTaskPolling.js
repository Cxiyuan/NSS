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
