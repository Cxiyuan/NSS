import { useState, useEffect, useRef } from 'react';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useHashRouting } from '../../hooks/useHashRouting';
import { useTaskMonitor } from '../../hooks/useTaskMonitor';
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

export default function TaskWorkspace({ task }) {
  const { state, dispatch } = useWorkspace();
  const { navigateTo } = useHashRouting();
  const activeTab = state.activeSubTab || 'results';

  // Fetch real task data from API to display correct URL/keywords in breadcrumb
  const [taskData, setTaskData] = useState(null);
  useEffect(() => {
    if (!task?.id) { setTaskData(null); return; }
    let cancelled = false;
    api.getTask(task.id).then(data => { if (!cancelled) setTaskData(data); }).catch(() => {});
    return () => { cancelled = true; };
  }, [task?.id]);

  const displayTask = taskData || task;
  const displayLabel = displayTask?.config?.url || displayTask?.config?.keywords || '任务';
  const monitor = useTaskMonitor(task?.id);

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
            time: new Date().toISOString(),
          },
        });
      }
    }
    prevStatusRef.current = monitor.status;
  }, [monitor.status, task?.id, dispatch]);

  async function handleStart(config) {
    try {
      const taskData = await api.createTask(config);
      dispatch({ type: 'SELECT_TASK', payload: { taskId: taskData.id, subTab: 'results' } });
      navigateTo('workspace', taskData.id, 'results');
    } catch (err) {
      console.error('Failed to create task:', err);
    }
  }

  return (
    <div className="workspace">
      {/* Workspace toolbar */}
      <div className="workspace__toolbar">
        <span className="workspace__breadcrumb">所有任务</span>
        <span className="workspace__separator">/</span>
        <span className="workspace__title">{displayLabel}</span>
        <span className="workspace__badge">
          {task?.type === 'url_crawl' ? 'URL 爬取' : '关键词搜索'}
        </span>
      </div>

      {/* Sub-tabs */}
      <ContentTabs tabs={TABS} activeTab={activeTab} onChange={(tab) => {
            dispatch({ type: 'SET_SUB_TAB', payload: tab });
            if (state.activeTaskId) navigateTo('workspace', state.activeTaskId, tab);
          }} />

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
              <LiveResultStream results={monitor.liveResults} />
              <h3 style={{ marginTop: 16, marginBottom: 8 }}>探测结果 ({monitor.resultsTotal})</h3>
              <ResultTable
                results={monitor.results}
                total={monitor.resultsTotal}
                page={monitor.page}
                limit={50}
                onPageChange={monitor.loadResults}
              />
            </div>
          )
        )}
        {activeTab === 'analytics' && (
          task?.id ? (
            <DashboardPanel topDomains={monitor.topDomains} topUrls={monitor.topUrls} loading={monitor.loading} />
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
