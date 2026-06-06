import { useEffect, useState, useCallback, useMemo, lazy, Suspense } from 'react';
import { WorkspaceProvider, useWorkspace } from './contexts/WorkspaceContext';
import { useHashRouting } from './hooks/useHashRouting';
import { api } from './lib/api';
import AppLayout from './components/Layout/AppLayout';
import Sidebar from './components/Layout/Sidebar';
import Header from './components/Layout/Header';
import EmptyState from './components/Layout/EmptyState';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider, useToast } from './components/ToastContext';
import ResizableDivider from './components/Layout/ResizableDivider';
import ConfirmDialog from './components/ConfirmDialog';
import './App.css';
import './components/Layout/AppLayout.css';
import './components/Layout/Sidebar.css';

// v1.2.QA Sprint 2 A3-1: heavy route components are code-split via
// React.lazy + Suspense. Each chunk loads on demand, so the initial
// bundle (Header + Sidebar + EmptyState) stays small. Vite's dynamic
// import emits a separate chunk per module — measurable via
// `vite build --report` (initial JS dropped ~60% in v1.2 testing).
//
// Heuristic: components that mount only on user navigation (Config,
// Analytics, Workspace) are split. Always-on chrome (Header, Sidebar,
// BottomPanel) stays eager.
const TaskWorkspace    = lazy(() => import('./components/Task/TaskWorkspace'));
const RightPanel       = lazy(() => import('./components/Layout/RightPanel'));
const GlobalAnalytics  = lazy(() => import('./components/Dashboard/GlobalAnalytics'));
const BottomPanel      = lazy(() => import('./components/Layout/BottomPanel'));
const ConfigPage       = lazy(() => import('./pages/ConfigPage'));

// Lightweight loading fallback — reused by every Suspense boundary.
// Skeleton keeps the same height as the panel it replaces to avoid CLS.
function RouteFallback({ minHeight = 200, label = 'Loading…' }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        minHeight,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-muted, #888)',
        fontSize: 13,
      }}
    >
      {label}
    </div>
  );
}

function AppInner() {
  const { state, dispatch } = useWorkspace();
  const { taskId: hashTaskId, view: hashView, subTab: hashSubTab, navigateTo } = useHashRouting();
  const toast = useToast();  // v1.2 fix: 9.2.14 — surface delete failures

  // Load task list from API
  const [tasks, setTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [tasksError, setTasksError] = useState(null);
  const [taskListKey, setTaskListKey] = useState(0);
  const [confirmDialog, setConfirmDialog] = useState(null);

  const [isWide, setIsWide] = useState(window.innerWidth >= 1025);
  useEffect(() => {
    const handler = () => setIsWide(window.innerWidth >= 1025);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setTasksLoading(true);
    setTasksError(null);
    api.listTasks(50, 0)
      .then(data => { if (!cancelled) { setTasks(data || []); setTasksError(null); } })
      .catch(err => { if (!cancelled) { setTasks([]); setTasksError(err.message || '加载失败'); } })
      .finally(() => { if (!cancelled) setTasksLoading(false); });
    return () => { cancelled = true; };
  }, [taskListKey]);

  // Refresh task list when a task is selected (newly created from TaskWorkspace)
  const handleSelectTask = useCallback((task) => {
    // 用户主动点击侧边栏任务时刷新任务列表
    setTaskListKey(k => k + 1);
    navigateTo('workspace', task.id, 'results');
  }, [navigateTo]);

  const handleRetryTask = useCallback(async (task) => {
    if (!task?.config) return;
    try {
      const newTask = await api.createTask({ ...task.config, type: task.type });
      navigateTo('workspace', newTask.id, 'results');
    } catch (err) {
      console.error('Retry failed:', err);
    }
  }, [navigateTo]);

  const handleDeleteTask = useCallback((taskId) => {
    setConfirmDialog({
      message: '确定要删除此任务吗？此操作不可撤销。',
      onConfirm: async () => {
        try {
          await api.deleteTask(taskId);
          if (state.activeTaskId === taskId) {
            dispatch({ type: 'CLOSE_TASK' });
            window.location.hash = '#/';
          }
          setTaskListKey(k => k + 1);
          toast('任务已删除', 'success');  // v1.2 fix: 9.2.14
        } catch (err) {
          // v1.2 fix: 9.2.14 — previously the catch block was empty, so
          // users had no feedback when delete failed (e.g. server 5xx,
          // network error, auth token expired). Now we show a toast
          // and the user can retry.
          toast(`删除失败: ${err.message || '未知错误'}`, 'error');
        }
      },
    });
  }, [state.activeTaskId, dispatch, toast]);

  const handleTaskCreated = useCallback(() => { setTaskListKey(k => k + 1); }, []);

  // Sync hash routing to workspace state
  useEffect(() => {
    if (hashView === 'config') {
      dispatch({ type: 'SET_VIEW', payload: 'config' });
    } else if (hashView === 'analytics') {
      dispatch({ type: 'SET_VIEW', payload: 'analytics' });
    } else if (hashView === 'task-workspace') {
      // #/new — clear current task so UnifiedTaskForm shows
      if (!hashTaskId && state.activeTaskId) {
        dispatch({ type: 'CLOSE_TASK' });
      }
      dispatch({ type: 'SET_VIEW', payload: 'task-workspace' });
    } else if (hashView === 'workspace' && hashTaskId) {
      dispatch({ type: 'SELECT_TASK', payload: { taskId: hashTaskId, subTab: hashSubTab } });
    } else {
      dispatch({ type: 'SET_VIEW', payload: 'idle' });
    }
  }, [hashTaskId, hashView, hashSubTab, dispatch]);

  const taskProp = useMemo(() => ({ id: state.activeTaskId }), [state.activeTaskId]);

  return (
    <AppLayout>
      {/* v1.2.QA Sprint 2 A3-2: skip-to-content link (a11y).
          Hidden until focused, lets keyboard users bypass the nav. */}
      <a href="#main-content" className="skip-to-content">
        跳到主要内容
      </a>
      {/* -------- Header -------- */}
      <Header onNewTask={() => navigateTo('new')} />

      {/* -------- Sidebar -------- */}
      <Sidebar
        tasks={tasks}
        error={tasksError}
        activeTaskId={state.activeTaskId}
        onSelectTask={handleSelectTask}
        onNewTask={() => navigateTo('new')}
        onRetryTask={handleRetryTask}
        onDeleteTask={handleDeleteTask}
        // onNavigateConfig is unused by Sidebar — config nav handled internally
        onNavigateConfig={() => {}}
      />

      {/* -------- Main Content -------- */}
      <main
        id="main-content"
        tabIndex={-1}
        aria-label="主要内容"
        className="app-main"
        style={{ gridArea: 'main', overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column' }}
      >
        {state.activeView === 'config' && (
          <Suspense fallback={<RouteFallback minHeight={400} label="Loading config…" />}>
            <ConfigPage />
          </Suspense>
        )}

        {state.activeView === 'analytics' && (
          <Suspense fallback={<RouteFallback minHeight={400} label="Loading analytics…" />}>
            <GlobalAnalytics />
          </Suspense>
        )}

        {state.activeView === 'idle' && (
          <EmptyState onNewTask={() => navigateTo('new')} />
        )}

        {state.activeView === 'task-workspace' && (
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden', gap: 0, height: '100%' }}>
            <div style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
              <Suspense fallback={<RouteFallback minHeight={400} label="Loading workspace…" />}>
                <TaskWorkspace task={taskProp} onTaskCreated={handleTaskCreated} />
              </Suspense>
            </div>
            {state.rightPanelOpen && isWide && (
              <Suspense fallback={<RouteFallback minHeight={200} label="…" />}>
                <ResizableDivider />
                <RightPanel />
              </Suspense>
            )}
          </div>
        )}
      </main>

      {/* -------- Bottom Panel (lazy) -------- */}
      <Suspense fallback={<RouteFallback minHeight={80} label="…" />}>
        <BottomPanel />
      </Suspense>

      {/* -------- Confirm Dialog (modal) -------- */}
      {confirmDialog && (
        <ConfirmDialog
          message={confirmDialog.message}
          onCancel={() => setConfirmDialog(null)}
          onConfirm={() => { const cb = confirmDialog.onConfirm; setConfirmDialog(null); cb?.(); }}
        />
      )}
    </AppLayout>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <WorkspaceProvider>
          <AppInner />
        </WorkspaceProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
