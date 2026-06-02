import { useWorkspace } from '../../contexts/WorkspaceContext';

const EVENT_ICONS = {
  running: '▶',
  paused: '⏸',
  completed: '✓',
  error: '✕',
  cancelled: '⊘',
};

function formatRelativeTime(isoString) {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
  if (diffMs < 0) return '刚刚';
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}秒前`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  return `${days}天前`;
}

export default function BottomPanel() {
  const { state, dispatch } = useWorkspace();
  const isOpen = state.bottomPanelOpen;
  const events = state.activityEvents || [];

  return (
    <div className="app-bottom" style={{ gridArea: 'bottom', borderTop: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
      {/* Tab bar */}
      <div onClick={() => dispatch({ type: 'TOGGLE_BOTTOM_PANEL' })}
        style={{ display: 'flex', alignItems: 'center', height: 32, padding: '0 16px', cursor: 'pointer', fontSize: 12, color: 'var(--color-text-muted)', gap: 6 }}>
        <span>{isOpen ? '▼' : '▲'}</span>
        <span>活动日志</span>
        {events.length > 0 && (
          <span style={{ background: 'var(--color-primary)', color: '#fff', fontSize: 10, borderRadius: 8, padding: '0 6px', lineHeight: '16px' }}>
            {events.length}
          </span>
        )}
        <span style={{ marginLeft: 'auto' }}>{isOpen ? '收起' : '展开'}</span>
      </div>

      {/* Panel body */}
      {isOpen && (
        <div style={{ maxHeight: 240, overflow: 'auto', padding: '8px 16px', borderTop: '1px solid var(--color-border)' }}>
          {events.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-muted)', fontSize: 12 }}>
              暂无活动记录
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {events.map((event) => (
                <div key={event.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12, color: 'var(--color-text)' }}>
                  <span style={{
                    width: 20,
                    textAlign: 'center',
                    fontSize: 14,
                    color: event.type === 'error' ? 'var(--color-error)'
                      : event.type === 'completed' ? 'var(--color-success, #16a34a)'
                      : event.type === 'running' ? 'var(--color-primary)'
                      : event.type === 'cancelled' ? 'var(--color-text-muted)'
                      : 'var(--color-text-muted)',
                  }}>
                    {EVENT_ICONS[event.type] || '●'}
                  </span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {event.label}
                  </span>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: 11, flexShrink: 0 }}>
                    {formatRelativeTime(event.time)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
