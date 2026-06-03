import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../lib/api';

const EMPTY_STATS = { crawled: 0, total: 0, external: 0, depth: 0, filtered: 0 };

/**
 * useTaskMonitor — manages real-time task state via WebSocket + REST fallback.
 *
 * Provides:
 *   - WebSocket connection with auto-reconnect (exponential backoff)
 *   - REST polling fallback (every 3s when WS is disconnected)
 *   - Task status / progress / results / logs
 *   - Pause / Resume / Cancel controls
 *   - Analytics data (top domains, top URLs)
 */
export function useTaskMonitor(taskId) {
  const [status, setStatus] = useState('idle');
  const [stats, setStats] = useState(EMPTY_STATS);
  const [liveResults, setLiveResults] = useState([]);
  const [results, setResults] = useState([]);
  const [resultsTotal, setResultsTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [logs, setLogs] = useState([]);
  const [topDomains, setTopDomains] = useState([]);
  const [topUrls, setTopUrls] = useState([]);
  const [loading, setLoading] = useState(false);
  const [resultsError, setResultsError] = useState(null);
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef(null);
  const retryRef = useRef(0);
  const mountedRef = useRef(true);
  const pageRef = useRef(1);
  const pollTimerRef = useRef(null);

  // ---------- Load task initial state ----------
  useEffect(() => {
    if (!taskId) return;
    // 切换任务时重置所有状态
    setStatus('idle');
    setStats(EMPTY_STATS);
    setResults([]);
    setLiveResults([]);
    setLogs([]);
    setTopDomains([]);
    setTopUrls([]);
    let cancelled = false;
    api.getTask(taskId).then(task => {
      if (cancelled) return;
      setStatus(task.status);
      if (task.stats) setStats(s => ({ ...s, ...task.stats }));
    }).catch(() => {});
    loadResults(1);
    loadAnalytics();
    return () => { cancelled = true; };
  }, [taskId]);

  // ---------- WebSocket ----------
  useEffect(() => {
    if (!taskId) return;
    mountedRef.current = true;
    retryRef.current = 0;
    connectWS(taskId);
    return () => {
      mountedRef.current = false;
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [taskId]);

  function connectWS(id) {
    if (!id || !mountedRef.current) return;
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    let wsUrl = `${protocol}//${location.host}/ws?taskId=${id}`;
    try {
      const t = localStorage.getItem('radar_token');
      if (t) wsUrl += '&token=' + encodeURIComponent(t);
    } catch {}
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleWSMessage(data);
      } catch {}
    };

    ws.onclose = () => {
      wsRef.current = null;
      setWsConnected(false);
      if (!mountedRef.current) return;
      retryRef.current++;
      const delay = Math.min(1000 * Math.pow(2, retryRef.current - 1), 30000);
      setTimeout(() => connectWS(id), delay);
    };

    ws.onopen = () => {
      retryRef.current = 0;
      setWsConnected(true);
    };
  }

  function handleWSMessage(data) {
    if (data.type === 'progress') {
      setStats(s => ({ ...s, crawled: data.crawled, total: data.total, depth: data.depth, filtered: data.filtered ?? s.filtered, visited: data.visited ?? s.visited }));
    }
    if (data.type === 'status') {
      setStatus(data.status);
    }
    if (data.type === 'result') {
      const result = {
        ...data.result,
        found_on: data.result.foundOn ?? data.result.found_on,
        link_type: data.result.linkType ?? data.result.link_type,
      };
      setLiveResults(r => {
        if (r.some(item => item.url === result.url)) return r;
        return [result, ...r].slice(0, 20);
      });
      if (pageRef.current === 1) {
        setResults(r => {
          if (r.some(item => item.url === result.url)) return r;
          return [result, ...r];
        });
        setResultsTotal(t => t + 1);
      }
    }
    if (data.type === 'result_title') {
      setResults(r => r.map(item =>
        item.url === data.url ? { ...item, page_title: data.pageTitle || item.page_title, status_code: data.statusCode || item.status_code } : item
      ));
      setLiveResults(r => r.map(item =>
        item.url === data.url ? { ...item, page_title: data.pageTitle || item.page_title, status_code: data.statusCode || item.status_code } : item
      ));
    }
    if (data.type === 'log') {
      const entry = { ...data, _key: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) };
      setLogs(l => [...l.slice(-99), entry]);
    }
  }

  // ---------- REST fallback polling (only when WS disconnected) ----------
  useEffect(() => {
    if (!taskId || wsConnected || status === 'completed' || status === 'error' || status === 'cancelled') {
      return;
    }
    function poll() {
      api.getTask(taskId).then(t => {
        if (t.status !== status) setStatus(t.status);
        if (t.stats) setStats(s => ({ ...s, ...t.stats }));
      }).catch(() => {
        // Server unreachable — mark as error on first failure
        setStatus(s => s === 'running' || s === 'pending' ? 'error' : s);
      });
    }
    pollTimerRef.current = setInterval(poll, 3000);
    return () => clearInterval(pollTimerRef.current);
  }, [taskId, status, wsConnected]);

  // ---------- Analytics polling (real-time during task, frozen after) ----------
  const analyticsTimerRef = useRef(null);
  useEffect(() => {
    if (!taskId || status === 'completed' || status === 'error' || status === 'cancelled') {
      return;
    }
    // Initial load
    loadAnalytics();
    // Periodic refresh every 5s during task execution
    analyticsTimerRef.current = setInterval(loadAnalytics, 5000);
    return () => clearInterval(analyticsTimerRef.current);
  }, [taskId, status]);

  // ---------- Data loading ----------
  async function loadResults(p) {
    if (!taskId) return;
    setLoading(true);
    setResultsError(null);
    try {
      const data = await api.getResults(taskId, { page: p, limit: 50 });
      if (!mountedRef.current) return;
      setResults(data.results || []);
      setResultsTotal(data.total || 0);
      setPage(p);
      pageRef.current = p;
    } catch (err) {
      setResultsError(err.message || '加载失败');
    }
    if (!mountedRef.current) return;
    setLoading(false);
  }

  async function loadAnalytics() {
    if (!taskId) return;
    try {
      const [domains, urls] = await Promise.all([
        api.getTopDomains(taskId, 10),
        api.getTopUrls(taskId, 10),
      ]);
      if (!mountedRef.current) return;
      setTopDomains(domains || []);
      setTopUrls(urls || []);
    } catch {}
  }

  // ---------- Task controls ----------
  const pause = useCallback(async () => {
    if (!taskId) return;
    try { await api.pauseTask(taskId); setStatus('paused'); } catch {}
  }, [taskId]);

  const resume = useCallback(async () => {
    if (!taskId) return;
    try { await api.resumeTask(taskId); setStatus('running'); } catch {}
  }, [taskId]);

  const cancel = useCallback(async () => {
    if (!taskId) return;
    try { await api.cancelTask(taskId); setStatus('cancelled'); } catch {}
  }, [taskId]);

  return {
    taskId, status, stats,
    liveResults, results, resultsTotal, resultsError, page,
    logs, topDomains, topUrls, loading,
    loadResults, loadAnalytics,
    pause, resume, cancel,
  };
}
