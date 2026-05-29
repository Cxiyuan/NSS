import { useState, useCallback, useRef } from 'react';
import TaskForm from '../components/TaskForm';
import ProgressPanel from '../components/ProgressPanel';
import ResultTable from '../components/ResultTable';
import TaskHistory from '../components/TaskHistory';
import { api } from '../lib/api';
import { useWebSocket } from '../hooks/useWebSocket';
import { useTaskPolling } from '../hooks/useTaskPolling';

export default function UrlCrawlPage() {
  const [taskId, setTaskId] = useState(null);
  const [status, setStatus] = useState('idle');
  const [stats, setStats] = useState({ crawled: 0, total: 0, external: 0, depth: 0 });
  const [results, setResults] = useState([]);
  const [resultsTotal, setResultsTotal] = useState(0);
  const [page, setPage] = useState(1);
  const taskIdRef = useRef(null);

  const onWSMessage = useCallback((data) => {
    if (data.type === 'progress') {
      setStats(s => ({ ...s, crawled: data.crawled, total: data.total, depth: data.depth }));
    }
    if (data.type === 'status') {
      setStatus(data.status);
    }
    if (data.type === 'result') {
      setResults(r => [data.result, ...r].slice(0, 200));
      setStats(s => ({ ...s, total: s.total + 1, external: s.external + (data.result.isExternal ? 1 : 0) }));
    }
  }, []);

  useWebSocket(taskId, onWSMessage);
  useTaskPolling(taskId, (task) => {
    if (task.status !== status) setStatus(task.status);
  });

  async function handleSubmit(config) {
    setResults([]);
    setStats({ crawled: 0, total: 0, external: 0, depth: 0 });
    setPage(1);
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

  async function loadResults(tid, p) {
    try {
      const data = await api.getResults(tid, { page: p, limit: 50 });
      setResults(data.results || []);
      setResultsTotal(data.total || 0);
    } catch {}
  }

  function handlePageChange(p) {
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
    a.download = `crawl-results-${taskId}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleSelectTask(task) {
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

  return (
    <div className="page">
      <div className="page__main">
        <h2>Website URL Crawler</h2>
        <TaskForm type="url_crawl" onSubmit={handleSubmit} disabled={status === 'running'} />

        {taskId && (
          <>
            <div className="page__controls">
              <ProgressPanel status={status} stats={stats} />
              {status === 'running' && <button onClick={handlePause} className="btn">Pause</button>}
              {status === 'paused' && <button onClick={handleResume} className="btn btn--primary">Resume</button>}
              {(status === 'running' || status === 'paused') && <button onClick={handleCancel} className="btn btn--danger">Cancel</button>}
              {status === 'completed' && (
                <button onClick={handleExportPDF} className="btn btn--primary">Export PDF</button>
              )}
            </div>

            <h3>Results ({resultsTotal})</h3>
            <ResultTable
              results={results}
              total={resultsTotal}
              page={page}
              limit={50}
              onPageChange={handlePageChange}
            />
          </>
        )}
      </div>

      <aside className="page__sidebar">
        <TaskHistory onSelect={handleSelectTask} />
      </aside>
    </div>
  );
}
