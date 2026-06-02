import { useState, useCallback, useRef, useEffect } from 'react';
import { api } from '../lib/api';
import { useWebSocket } from './useWebSocket';
import { useTaskPolling } from './useTaskPolling';
import { EMPTY_STATS } from '../lib/constants';
import { generateId } from '../lib/utils';

function sessionKey(pdfPrefix) {
  return pdfPrefix === 'search-results' ? 'radarTaskId_search' : 'radarTaskId_url';
}

export function useTaskPage({ showExternalCount = true, pdfPrefix = 'crawl-results' }) {
  const KEY = sessionKey(pdfPrefix);
  // Restore taskId from sessionStorage on mount (separate key per page type)
  const [taskId, setTaskId] = useState(() => sessionStorage.getItem(KEY));
  const [status, setStatus] = useState('idle');
  const [stats, setStats] = useState(EMPTY_STATS);
  const [liveResults, setLiveResults] = useState([]);
  const [results, setResults] = useState([]);
  const [resultsTotal, setResultsTotal] = useState(0);
  const [liveTotal, setLiveTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [logs, setLogs] = useState([]);
  const [taskConfig, setTaskConfig] = useState(null);
  const [startTime, setStartTime] = useState(null);
  const [listRefreshKey, setListRefreshKey] = useState(0);
  const [resultsError, setResultsError] = useState(null);
  const [loading, setLoading] = useState(false);
  const taskIdRef = useRef(null);
  const pageRef = useRef(1);
  const submittingRef = useRef(false);

  // --- Data loading (defined before effects that use it) ---
  async function loadResults(tid, p) {
    setLoading(true);
    setResultsError(null);
    try {
      const data = await api.getResults(tid, { page: p, limit: 50 });
      setResults(data.results || []);
      setResultsTotal(data.total || 0);
    } catch (err) {
      setResultsError(err.message || 'Failed to load results');
    } finally {
      setLoading(false);
    }
  }

  // --- Persist taskId to sessionStorage ---
  useEffect(() => {
    if (taskId) {
      sessionStorage.setItem(KEY, taskId);
    } else {
      sessionStorage.removeItem(KEY);
    }
  }, [taskId, KEY]);

  // --- Restore task data when taskId is set (from sessionStorage or user action) ---
  useEffect(() => {
    if (!taskId) return;
    let cancelled = false;
    async function restore() {
      try {
        const task = await api.getTask(taskId);
        if (cancelled) return;
        setStatus(task.status);
        if (task.stats) setStats(s => ({ ...s, ...task.stats }));
        if (task.config) setTaskConfig(task.config);
        setStartTime(task.created_at);
        taskIdRef.current = taskId;
        pageRef.current = 1;
        loadResults(taskId, 1);
      } catch {
        if (!cancelled) {
          setTaskId(null);
        }
      }
    }
    restore();
    return () => { cancelled = true; };
  }, [taskId]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- WebSocket ---
  const onWSMessage = useCallback((data) => {
    if (data.type === 'progress') {
      setStats(s => ({ ...s, crawled: data.crawled, total: data.total, depth: data.depth, filtered: data.filtered ?? s.filtered }));
    }
    if (data.type === 'status') {
      setStatus(data.status);
    }
    if (data.type === 'result') {
      const result = {
        ...data.result,
        _key: generateId(),
        found_on: data.result.foundOn ?? data.result.found_on,
        link_type: data.result.linkType ?? data.result.link_type,
      };
      setLiveResults(r => [result, ...r].slice(0, 20));
      setLiveTotal(t => t + 1);
      // Only update main results table when on page 1 (default crawling view)
      // Prevents WS results from corrupting paginated data on pages 2+
      if (pageRef.current === 1) {
        setResults(r => [result, ...r]);
        // Do NOT increment resultsTotal from WS — it reflects the paginated total from the API
      }
      setStats(s => ({
        ...s,
        external: showExternalCount ? s.external + (data.result.isExternal ? 1 : 0) : s.external,
      }));
    }
    if (data.type === 'result_title') {
      // Update title/status for an existing result
      setResults(r => r.map(item =>
        item.url === data.url
          ? { ...item, page_title: data.pageTitle || item.page_title, status_code: data.statusCode || item.status_code }
          : item
      ));
      setLiveResults(r => r.map(item =>
        item.url === data.url
          ? { ...item, page_title: data.pageTitle || item.page_title, status_code: data.statusCode || item.status_code }
          : item
      ));
    }
    if (data.type === 'log') {
      setLogs(l => [...l.slice(-49), data]);
    }
  }, [showExternalCount]);

  useWebSocket(taskId, onWSMessage);
  useTaskPolling(taskId, (task) => {
    if (task.status !== status) setStatus(task.status);
    if (task.stats) setStats(s => ({ ...s, ...task.stats }));
  });

  // --- Actions ---
  async function handleSubmit(config) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setLiveResults([]);
    setResults([]);
    setStats(EMPTY_STATS);
    setLogs([]);
    setPage(1);
    pageRef.current = 1;
    setStartTime(new Date().toISOString());
    setTaskConfig(config);
    setResultsTotal(0);
    setLiveTotal(0);
    setResultsError(null);
    try {
      const task = await api.createTask(config);
      setTaskId(task.id);
      setStatus('running');
      taskIdRef.current = task.id;
      loadResults(task.id, 1);
      setListRefreshKey(k => k + 1); // trigger TaskHistory refresh
    } catch (err) {
      console.error(err);
    } finally {
      submittingRef.current = false;
    }
  }

  function handlePageChange(p) {
    pageRef.current = p;
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
    a.download = `${pdfPrefix}-${taskId}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleSelectTask(task) {
    pageRef.current = 1;
    setPage(1);
    setTaskId(task.id);
    setStatus(task.status);
    taskIdRef.current = task.id;
    // loadResults is NOT called here — the restore effect handles it
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

  return {
    taskId, status, stats,
    liveResults, results, resultsTotal, liveTotal, page, logs,
    taskConfig, startTime,
    handleSubmit, loadResults, handlePageChange, listRefreshKey,
    handleExportPDF, handleSelectTask,
    handlePause, handleResume, handleCancel,
    resultsError, loading,
  };
}
