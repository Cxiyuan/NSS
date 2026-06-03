import { useState, useMemo } from 'react';

const LEVEL_COLORS = {
  info: 'var(--color-text)',
  warn: '#92400e',
  error: 'var(--color-error)',
};

export default function LogViewer({ logs = [] }) {
  const [levelFilter, setLevelFilter] = useState('all');

  const filtered = useMemo(() => {
    if (levelFilter === 'all') return logs;
    return logs.filter(l => l.level === levelFilter);
  }, [logs, levelFilter]);

  return (
    <div className="log-viewer">
      <div className="log-viewer__toolbar">
        <span className="log-viewer__title">任务日志</span>
        <select value={levelFilter} onChange={e => setLevelFilter(e.target.value)}
          className="log-viewer__filter">
          <option value="all">全部 ({logs.length})</option>
          <option value="info">信息 ({logs.filter(l => l.level === 'info').length})</option>
          <option value="warn">警告 ({logs.filter(l => l.level === 'warn').length})</option>
          <option value="error">错误 ({logs.filter(l => l.level === 'error').length})</option>
        </select>
      </div>
      <div className="log-viewer__body">
        {filtered.length === 0 ? (
          <div className="log-viewer__empty">暂无日志</div>
        ) : (
          filtered.map((l, i) => (
            <div key={l.id || l._key || i} className={`log-viewer__entry log-viewer__entry--${l.level}`}>
              <span className="log-viewer__level">{l.level.toUpperCase()}</span>
              <span className="log-viewer__msg">{l.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
