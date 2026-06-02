import { useEffect, useState, useCallback } from 'react';
import { WorkspaceProvider, useWorkspace } from './contexts/WorkspaceContext';
import { useHashRouting } from './hooks/useHashRouting';
import { api } from './lib/api';
import AppLayout from './components/Layout/AppLayout';
import Sidebar from './components/Layout/Sidebar';
import Header from './components/Layout/Header';
import EmptyState from './components/Layout/EmptyState';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider } from './components/ToastContext';
import TaskWorkspace from './components/Task/TaskWorkspace';
import ResizableDivider from './components/Layout/ResizableDivider';
import RightPanel from './components/Layout/RightPanel';
import GlobalAnalytics from './components/Dashboard/GlobalAnalytics';
import BottomPanel from './components/Layout/BottomPanel';
import ConfigPage from './pages/ConfigPage';
import './App.css';
import './components/Layout/AppLayout.css';
import './components/Layout/Sidebar.css';

function AppInner() {
  const { state, dispatch } = useWorkspace();
  const { taskId: hashTaskId, view: hashView, subTab: hashSubTab, navigateTo } = useHashRouting();

  // Load task list from API
  const [tasks, setTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [taskListKey, setTaskListKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setTasksLoading(true);
    api.listTasks(50, 0)
      .then(data => { if (!cancelled) setTasks(data || []); })
      .catch(() => { if (!cancelled) setTasks([]); })
      .finally(() => { if (!cancelled) setTasksLoading(false); });
    return () => { cancelled = true; };
  }, [taskListKey]);

  // Refresh task list when a task is selected (newly created from TaskWorkspace)
  const handleSelectTask = useCallback((task) => {
    // navigateTo 触发 hashchange → sync effect 处理 SELECT_TASK + 刷新任务列表
    navigateTo('workspace', task.id, 'results');
  }, [navigateTo]);

  const handleRetryTask = useCallback((taskId) => {
    console.log('retry', taskId);
  }, []);

  const handleDeleteTask = useCallback(async (taskId) => {
    try { await api.deleteTask(taskId); setTaskListKey(k => k + 1); } catch {}
  }, []);

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
      setTaskListKey(k => k + 1);
    } else {
      dispatch({ type: 'SET_VIEW', payload: 'idle' });
    }
  }, [hashTaskId, hashView, hashSubTab, dispatch, setTaskListKey]);

  return (
    <AppLayout>
      {/* -------- Header -------- */}
      <Header onNewTask={() => navigateTo('new')} />

      {/* -------- Sidebar -------- */}
      <Sidebar
        tasks={tasks}
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
        className="app-main"
        style={{ gridArea: 'main', overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column' }}
      >
        {state.activeView === 'config' && (
          <ConfigPage />
        )}

        {state.activeView === 'analytics' && (
          <GlobalAnalytics />
        )}

        {state.activeView === 'idle' && (
          <EmptyState onNewTask={() => navigateTo('new')} />
        )}

        {state.activeView === 'task-workspace' && (
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden', gap: 0, height: '100%' }}>
            <div style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
              <TaskWorkspace task={{ id: state.activeTaskId, config: { url: state.activeTaskId } }} />
            </div>
            {state.rightPanelOpen && window.innerWidth >= 1025 && (
              <>
                <ResizableDivider />
                <RightPanel />
              </>
            )}
          </div>
        )}
      </main>

      {/* -------- Bottom Panel -------- */}
      <BottomPanel />
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
