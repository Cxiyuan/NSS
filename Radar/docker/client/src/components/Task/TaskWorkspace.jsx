import { useState } from 'react';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useHashRouting } from '../../hooks/useHashRouting';
import { api } from '../../lib/api';
import UnifiedTaskForm from './UnifiedTaskForm';
import ContentTabs from './ContentTabs';
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
        <span className="workspace__title">{task?.config?.url || task?.config?.keywords || '任务'}</span>
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
              <p className="text-muted">任务监控视图 (Phase 6+)</p>
            </div>
          )
        )}
        {activeTab === 'analytics' && (
          <div className="workspace__placeholder">分析仪表盘 (Phase 9+)</div>
        )}
        {activeTab === 'logs' && (
          <div className="workspace__placeholder">日志视图 (Phase 11+)</div>
        )}
      </div>
    </div>
  );
}
