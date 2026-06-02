import { useState } from 'react';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import UnifiedTaskForm from './UnifiedTaskForm';
import ContentTabs from './ContentTabs';

const TABS = [
  { id: 'results', label: '结果', icon: '\u{1F4CB}' },
  { id: 'analytics', label: '分析', icon: '\u{1F4CA}' },
  { id: 'logs', label: '日志', icon: '\u{1F4DD}' },
];

export default function TaskWorkspace({ task }) {
  const { state, dispatch } = useWorkspace();
  const activeTab = state.activeSubTab || 'results';

  function handleStart(config) {
    // In Phase 5, this will call API — for now just log
    console.log('Starting task:', config);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Workspace toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>所有任务</span>
        <span style={{ color: 'var(--color-text-muted)' }}>/</span>
        <span style={{ fontWeight: 600, fontSize: 14 }}>{task?.config?.url || task?.config?.keywords || '任务'}</span>
        <span style={{ marginLeft: 'auto', fontSize: 12, padding: '2px 8px', borderRadius: 4, background: '#eff6ff', color: 'var(--color-primary)', fontWeight: 500 }}>
          {task?.type === 'url_crawl' ? 'URL 爬取' : '关键词搜索'}
        </span>
      </div>

      {/* Sub-tabs */}
      <ContentTabs tabs={TABS} activeTab={activeTab} onChange={(tab) => dispatch({ type: 'SET_SUB_TAB', payload: tab })} />

      {/* Tab content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {activeTab === 'results' && (
          // If task has not started, show form
          !task?.id ? (
            <UnifiedTaskForm onStart={handleStart} />
          ) : (
            <div>
              <p style={{ color: 'var(--color-text-muted)' }}>任务监控视图 (Phase 6+)</p>
            </div>
          )
        )}
        {activeTab === 'analytics' && (
          <div style={{ color: 'var(--color-text-muted)', padding: 40, textAlign: 'center' }}>分析仪表盘 (Phase 9+)</div>
        )}
        {activeTab === 'logs' && (
          <div style={{ color: 'var(--color-text-muted)', padding: 40, textAlign: 'center' }}>日志视图 (Phase 11+)</div>
        )}
      </div>
    </div>
  );
}
