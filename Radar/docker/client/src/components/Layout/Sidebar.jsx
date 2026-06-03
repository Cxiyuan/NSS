import { useState, useMemo, useCallback } from 'react';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import TaskGroupList from '../Task/TaskGroupList';
import './Sidebar.css';

/**
 * Sidebar — the app's primary navigation sidebar.
 *
 * Renders inside the grid area `app-sidebar` (set by AppLayout).
 *
 * Props:
 *   tasks        – full task list (unsorted, unfiltered)
 *   activeTaskId – currently selected task id (or null)
 *   onSelectTask – called with a task object when user clicks a task
 *   onNewTask    – called when the "新任务" button is clicked
 *   onRetryTask  – called with a task object when user clicks retry on an error task
 *   onDeleteTask – called with a task id when user clicks delete on a completed/cancelled task
 */
export default function Sidebar({ tasks, error, activeTaskId, onSelectTask, onNewTask, onRetryTask, onDeleteTask }) {
  const { state, dispatch } = useWorkspace();
  const { sidebarCollapsed } = state;

  const [searchQuery, setSearchQuery] = useState('');

  /** Filter tasks in real-time by matching label text (URL or keywords). */
  const filteredTasks = useMemo(() => {
    if (!searchQuery.trim()) return tasks || [];
    const q = searchQuery.trim().toLowerCase();
    return (tasks || []).filter((task) => {
      const label =
        task.type === 'url_crawl'
          ? task.config?.url || ''
          : task.config?.keywords || '';
      return label.toLowerCase().includes(q);
    });
  }, [tasks, searchQuery]);

  const handleSearchChange = useCallback((e) => {
    setSearchQuery(e.target.value);
  }, []);

  const handleConfigClick = useCallback(() => {
    window.location.hash = '#/config';
  }, []);

  // Close mobile sidebar on task select
  const handleSelect = useCallback((task) => {
    if (state.mobileSidebarOpen) {
      dispatch({ type: 'SET_MOBILE_SIDEBAR', payload: false });
    }
    onSelectTask?.(task);
  }, [state.mobileSidebarOpen, dispatch, onSelectTask]);

  return (
    <>
      {/* Mobile backdrop overlay */}
      {state.mobileSidebarOpen && (
        <div className="sidebar__mobile-backdrop"
          onClick={() => dispatch({ type: 'SET_MOBILE_SIDEBAR', payload: false })} />
      )}
      <aside
        className={`app-sidebar sidebar${sidebarCollapsed ? ' sidebar--collapsed' : ''}${state.mobileSidebarOpen ? ' sidebar--mobile-open' : ''}`}
      >
      {/* ---- Header / New Task Button ---- */}
      <div className="sidebar__header">
        <button
          className="sidebar__new-btn"
          onClick={onNewTask}
          title="新任务"
        >
          <span className="sidebar__new-btn-label">+ 新任务</span>
          <span hidden={!sidebarCollapsed} aria-hidden={!sidebarCollapsed}>
            +
          </span>
        </button>
      </div>

      {/* ---- Search Filter ---- */}
      <div className="sidebar__search">
        <input
          type="text"
          placeholder="搜索任务..."
          value={searchQuery}
          onChange={handleSearchChange}
        />
      </div>

      {/* ---- Error State ---- */}
      {error && (
        <div className="sidebar__error" style={{ padding: '8px 12px', margin: '0 12px 8px', background: '#fef2f2', color: '#b91c1c', borderRadius: 4, fontSize: 12 }}>
          {error}
        </div>
      )}

      {/* ---- Task List ---- */}
      <div className="sidebar__task-list">
        <TaskGroupList
          tasks={filteredTasks}
          activeTaskId={activeTaskId}
          onSelect={handleSelect}
          onRetry={onRetryTask}
          onDelete={onDeleteTask}
        />
      </div>

      {/* ---- Analytics Nav Item ---- */}
      <div className="sidebar__footer">
        <div className="sidebar__nav-item" onClick={() => {
          window.location.hash = '#/analytics';
        }}>
          <span>📊</span>
          {!state.sidebarCollapsed && <span>全局分析</span>}
        </div>
      </div>

      {/* ---- Footer / Nav Items ---- */}
      <div className="sidebar__footer">
        <button className="sidebar__nav-item" onClick={handleConfigClick} title="配置">
          <span className="sidebar__nav-item-icon">&#x2699;</span>
          <span className="sidebar__nav-item-label">配置</span>
        </button>
      </div>
    </aside>
    </>
  );
}
