import { useState, useCallback, useRef, useEffect } from 'react';
import { api } from '../lib/api';
import { useWebSocket } from './useWebSocket';
import { useTaskPolling } from './useTaskPolling';

const EMPTY_STATS = { crawled: 0, total: 0, external: 0, depth: 0, filtered: 0 };
const SESSION_KEY = 'radarLastTaskId';

export function useTaskPage({ showExternalCount = true, pdfPrefix = 'crawl-results' }) {
  // Restore taskId from sessionStorage on mount
  const [taskId, setTaskId] = useState(() => sessionStorage.getItem(SESSION_KEY));
  const [status, setStatus] = useState('idle');
  const [stats, setStats] = useState(EMPTY_STATS);
  const [liveResults, setLiveResults] = useState([]);
  const [results, setResults] = useState([]);
  const [resultsTotal, setResultsTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [logs, setLogs] = useState([]);
  const taskIdRef = useRef(null);
  const pageRef = useRef(1);

  // --- Data loading (defined before effects that use it) ---
  async function loadResults(tid, p) {
    try {
      const data = await api.getResults(tid, { page: p, limit: 50 });
      setResults(data.results || []);
      setResultsTotal(data.total || 0);
    } catch {}
  }

  // --- Persist taskId to sessionStorage ---
  useEffect(() => {
    if (taskId) {
      sessionStorage.setItem(SESSION_KEY, taskId);
    } else {
      sessionStorage.removeItem(SESSION_KEY);
    }
  }, [taskId]);

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
        found_on: data.result.foundOn ?? data.result.found_on,
        link_type: data.result.linkType ?? data.result.link_type,
      };
      setLiveResults(r => [result, ...r].slice(0, 20));
      // Only update main results table when on page 1 (default crawling view)
      // Prevents WS results from corrupting paginated data on pages 2+
      if (pageRef.current === 1) {
        setResults(r => [result, ...r]);
        setResultsTotal(t => t + 1);
      }
      setStats(s => ({
        ...s,
        total: s.total + 1,
        external: showExternalCount ? s.external + (data.result.isExternal ? 1 : 0) : s.external,
      }));
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
    setLiveResults([]);
    setResults([]);
    setStats(EMPTY_STATS);
    setLogs([]);
    setPage(1);
    pageRef.current = 1;
    try {
      const task = await api.createTask(config);
      setTaskId(task.id);
      setStatus('running');
      taskIdRef.current = task.id;
      loadResults(task.id, 1);
    } catch (err) {
      console.error(err);
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
    setTaskId(task.id);
    setStatus(task.status);
    taskIdRef.current = task.id;
    loadResults(task.id, 1);
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
    liveResults, results, resultsTotal, page, logs,
    handleSubmit, loadResults, handlePageChange,
    handleExportPDF, handleSelectTask,
    handlePause, handleResume, handleCancel,
  };
}