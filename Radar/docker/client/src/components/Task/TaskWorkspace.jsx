import { useState, useEffect, useRef, useMemo } from 'react';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useHashRouting } from '../../hooks/useHashRouting';
import { useTaskMonitor } from '../../hooks/useTaskMonitor';
import { useToast } from '../ToastContext';
import { api } from '../../lib/api';
import UnifiedTaskForm from './UnifiedTaskForm';
import ContentTabs from './ContentTabs';
import ProgressPanel from './ProgressPanel';
import LiveResultStream from './LiveResultStream';
import TaskControls from './TaskControls';
import ResultTable from './ResultTable';
import DashboardPanel from './DashboardPanel';
import LogViewer from './LogViewer';
import './TaskWorkspace.css';

const TABS = [
  { id: 'results', label: '结果', icon: '\u{1F4CB}' },
  { id: 'analytics', label: '分析', icon: '\u{1F4CA}' },
  { id: 'logs', label: '日志', icon: '\u{1F4DD}' },
];

export default function TaskWorkspace({ task, onTaskCreated }) {
  const { state, dispatch } = useWorkspace();
  const { navigateTo } = useHashRouting();
  const activeTab = state.activeSubTab || 'results';

  // Fetch real task data from API to display correct URL/keywords in breadcrumb
  const [taskData, setTaskData] = useState(null);
  useEffect(() => {
    if (!task?.id) { setTaskData(null); return; }
    let cancelled = false;
    api.getTask(task.id).then(data => { if (!cancelled) setTaskData(data); }).catch(() => { if (!cancelled && task?.id) toast.addToast('获取任务数据失败', 'error'); });
    return () => { cancelled = true; };
  }, [task?.id]);

  const displayTask = taskData || task;
  const displayLabel = displayTask?.config?.url || displayTask?.config?.keywords || '任务';
  const monitor = useTaskMonitor(task?.id);
  const toast = useToast();

  // Filter results by filteredDomains (added via RightPanel)
  const filteredResults = useMemo(() => {
    if (!state.filteredDomains.length) return monitor.results;
    return (monitor.results || []).filter(r => {
      try { const h = new URL(r.url).hostname.replace(/^\[|\]$/g, ''); return !state.filteredDomains.includes(h); } catch { return true; }
    });
  }, [monitor.results, state.filteredDomains]);

  const filteredLiveResults = useMemo(() => {
    if (!state.filteredDomains.length) return monitor.liveResults;
    return (monitor.liveResults || []).filter(r => {
      try { const h = new URL(r.url).hostname.replace(/^\[|\]$/g, ''); return !state.filteredDomains.includes(h); } catch { return true; }
    });
  }, [monitor.liveResults, state.filteredDomains]);

  const filteredResultsTotal = useMemo(() => {
    if (!state.filteredDomains.length) return monitor.resultsTotal;
    return filteredResults.length;
  }, [filteredResults.length, monitor.resultsTotal, state.filteredDomains.length]);

  // Filter analytics data to remove filtered domains
  const filteredTopDomains = useMemo(() => {
    if (!state.filteredDomains.length || !monitor.topDomains) return monitor.topDomains;
    return (monitor.topDomains || []).filter(d => !state.filteredDomains.includes(d.domain));
  }, [monitor.topDomains, state.filteredDomains]);

  const filteredTopUrls = useMemo(() => {
    if (!state.filteredDomains.length || !monitor.topUrls) return monitor.topUrls;
    return (monitor.topUrls || []).filter(u => {
      try { const h = new URL(u.url).hostname.replace(/^\[|\]$/g, ''); return !state.filteredDomains.includes(h); } catch { return true; }
    });
  }, [monitor.topUrls, state.filteredDomains]);

  // Dispatch activity events when monitor status changes
  const prevStatusRef = useRef(monitor.status);
  useEffect(() => {
    const prevStatus = prevStatusRef.current;
    if (prevStatus !== monitor.status && task?.id) {
      const statusToEvent = {
        running: { type: 'running', label: '任务开始运行' },
        paused: { type: 'paused', label: '任务已暂停' },
        completed: { type: 'completed', label: '任务已完成' },
        error: { type: 'error', label: '任务错误' },
        cancelled: { type: 'cancelled', label: '任务已取消' },
      };
      const event = statusToEvent[monitor.status];
      if (event) {
        dispatch({
          type: 'ADD_ACTIVITY_EVENT',
          payload: {
            id: `${task.id}-${monitor.status}-${Date.now()}`,
            ...event,
            taskId: task.id,
            taskLabel: displayLabel,
            time: new Date().toISOString(),
          },
        });
      }
    }
    prevStatusRef.current = monitor.status;
  }, [monitor.status, task?.id, dispatch]);

  async function handleExport() {
    try {
      const blob = await api.getBlob(`/tasks/${task.id}/export/pdf`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `radar-export-${task.id}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { toast.addToast('PDF 导出失败: ' + err.message, 'error'); }
  }

  async function handleStart(config) {
    try {
      const taskData = await api.createTask(config);
      if (!taskData?.id) { toast.addToast('任务创建返回数据异常', 'error'); return; }
      navigateTo('workspace', taskData.id, 'results');
      onTaskCreated?.();
    } catch (err) {
      toast.addToast(err.message || '任务创建失败', 'error');
    }
  }

  return (
    <div className="workspace">
      {/* Workspace toolbar */}
      <div className="workspace__toolbar">
        <a className="workspace__breadcrumb" href="#/" onClick={(e) => { e.preventDefault(); navigateTo('idle'); }}
          style={{ cursor: 'pointer', textDecoration: 'none', color: 'var(--color-primary)' }}>
          所有任务
        </a>
        <span className="workspace__separator">/</span>
        <span className="workspace__title">{displayLabel}</span>
        <span className="workspace__badge">
          {task?.type === 'url_crawl' ? 'URL 爬取' : '关键词搜索'}
        </span>
      </div>

      {/* Sub-tabs — only show when a task is selected */}
      {task?.id && (
        <ContentTabs tabs={TABS} activeTab={activeTab} onChange={(tab) => {
              navigateTo('workspace', state.activeTaskId, tab);
            }} />
      )}

      {/* Tab content */}
      <div className="workspace__content">
        {activeTab === 'results' && (
          !task?.id ? (
            <UnifiedTaskForm onStart={handleStart} />
          ) : (
            <div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                <ProgressPanel status={monitor.status} stats={monitor.stats} />
                <TaskControls
                  status={monitor.status}
                  onPause={monitor.pause}
                  onResume={monitor.resume}
                  onCancel={monitor.cancel}
                  onExportPDF={handleExport}
                />
              </div>
              {monitor.logs.length > 0 && (
                <div style={{ marginBottom: 16, maxHeight: 160, overflow: 'auto', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: 12, fontSize: 12, fontFamily: 'monospace' }}>
                  {monitor.logs.slice(-10).map((l, i) => (
                    <div key={i} style={{ color: l.level === 'error' ? 'var(--color-error)' : l.level === 'warn' ? '#92400e' : 'inherit' }}>
                      <strong>{l.level.toUpperCase()}</strong> {l.message}
                    </div>
                  ))}
                </div>
              )}
              {state.filteredDomains.length > 0 && (
                <div style={{ marginBottom: 8, fontSize: 12, color: 'var(--color-text-muted)' }}>
                  已过滤 {state.filteredDomains.join(', ')} 的域名结果
                  （原始 {monitor.resultsTotal} 条，过滤后 {filteredResultsTotal} 条）
                </div>
              )}
              <LiveResultStream results={filteredLiveResults} />
              <h3 style={{ marginTop: 16, marginBottom: 8 }}>探测结果 ({filteredResultsTotal})</h3>
              <ResultTable
                results={filteredResults}
                total={filteredResultsTotal}
                page={monitor.page}
                limit={50}
                onPageChange={monitor.loadResults}
                loading={monitor.loading}
                error={monitor.resultsError}
              />
            </div>
          )
        )}
        {activeTab === 'analytics' && (
          task?.id ? (
            <DashboardPanel topDomains={filteredTopDomains} topUrls={filteredTopUrls} loading={monitor.loading} />
          ) : (
            <div className="workspace__placeholder">创建并运行任务后，此处显示外链统计图表</div>
          )
        )}
        {activeTab === 'logs' && (
          <LogViewer logs={monitor.logs} />
        )}
      </div>
    </div>
  );
}
