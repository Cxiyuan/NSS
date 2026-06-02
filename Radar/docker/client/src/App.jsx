import { useEffect, useState } from 'react';
import { WorkspaceProvider, useWorkspace } from './contexts/WorkspaceContext';
import { useHashRouting } from './hooks/useHashRouting';
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

  // Demo tasks for sidebar development — will be replaced by API
  const [tasks] = useState([]);

  // Sync hash routing to workspace state
  useEffect(() => {
    if (hashView === 'config') {
      dispatch({ type: 'SET_VIEW', payload: 'config' });
    } else if (hashView === 'analytics') {
      dispatch({ type: 'SET_VIEW', payload: 'analytics' });
    } else if (hashView === 'workspace' && hashTaskId) {
      dispatch({ type: 'SELECT_TASK', payload: { taskId: hashTaskId, subTab: hashSubTab } });
    } else {
      dispatch({ type: 'SET_VIEW', payload: 'idle' });
    }
  }, [hashTaskId, hashView, hashSubTab, dispatch]);

  return (
    <AppLayout>
      {/* -------- Header -------- */}
      <Header onNewTask={() => navigateTo('idle')} />

      {/* -------- Sidebar -------- */}
      <Sidebar
        tasks={tasks}
        activeTaskId={state.activeTaskId}
        onSelectTask={(task) => {
          dispatch({ type: 'SELECT_TASK', payload: { taskId: task.id } });
          navigateTo('task', task.id, 'results');
        }}
        onNewTask={() => navigateTo('idle')}
        onRetryTask={(taskId) => console.log('retry', taskId)}
        onNavigateConfig={() => {
          dispatch({ type: 'SET_VIEW', payload: 'config' });
          navigateTo('config');
        }}
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
          <EmptyState onNewTask={() => navigateTo('idle')} />
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
