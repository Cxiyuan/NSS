import { useWorkspace } from '../../contexts/WorkspaceContext';

export default function BottomPanel() {
  const { state, dispatch } = useWorkspace();
  const isOpen = state.bottomPanelOpen;

  return (
    <div className="app-bottom" style={{ gridArea: 'bottom', borderTop: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
      {/* Tab bar */}
      <div onClick={() => dispatch({ type: 'TOGGLE_BOTTOM_PANEL' })}
        style={{ display: 'flex', alignItems: 'center', height: 32, padding: '0 16px', cursor: 'pointer', fontSize: 12, color: 'var(--color-text-muted)', gap: 6 }}>
        <span>{isOpen ? '▼' : '▲'}</span>
        <span>活动日志</span>
        <span style={{ marginLeft: 'auto' }}>{isOpen ? '收起' : '展开'}</span>
      </div>

      {/* Panel body */}
      {isOpen && (
        <div style={{ maxHeight: 240, overflow: 'auto', padding: '8px 16px', borderTop: '1px solid var(--color-border)' }}>
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-muted)', fontSize: 12 }}>
            任务活动将在此处显示
          </div>
        </div>
      )}
    </div>
  );
}
