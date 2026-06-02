import { useWorkspace } from '../../contexts/WorkspaceContext';
import ResultDetail from '../ResultDetail';

export default function RightPanel() {
  const { state, dispatch } = useWorkspace();
  if (!state.rightPanelContent) return null;

  const content = state.rightPanelContent;
  const isSplit = window.innerWidth >= 1025;

  if (!isSplit) {
    // Overlay mode for <1024px
    return (
      <div onClick={() => dispatch({ type: 'CLOSE_RIGHT_PANEL' })}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.2)', zIndex: 'var(--z-right-panel, 30)', display: 'flex', justifyContent: 'flex-end' }}>
        <div onClick={e => e.stopPropagation()}
          style={{ width: '90%', maxWidth: 420, height: '100vh', background: 'white', boxShadow: '-4px 0 12px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <PanelHeader content={content} onClose={() => dispatch({ type: 'CLOSE_RIGHT_PANEL' })} pinned={state.rightPanelPinned}
            onTogglePin={() => dispatch({ type: 'TOGGLE_PIN' })} />
          <PanelBody content={content} />
        </div>
      </div>
    );
  }

  // Split-pane mode for 1440px+
  return (
    <div className="right-split-pane"
      style={{ flex: '0 0 var(--right-panel-width, 40%)', minWidth: 320, maxWidth: '50%', display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--color-border)', background: 'var(--color-surface)', overflow: 'hidden' }}>
      <PanelHeader content={content} onClose={() => dispatch({ type: 'CLOSE_RIGHT_PANEL' })} pinned={state.rightPanelPinned}
        onTogglePin={() => dispatch({ type: 'TOGGLE_PIN' })} />
      <PanelBody content={content} />
    </div>
  );
}

function PanelHeader({ content, onClose, pinned, onTogglePin }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {content.data?.url || '详情'}
      </span>
      <button onClick={onTogglePin} title="固定面板"
        style={{ background: 'none', border: 'none', fontSize: 14, cursor: 'pointer', color: pinned ? 'var(--color-primary)' : 'var(--color-text-muted)', padding: 4 }}>📌</button>
      <button onClick={onClose}
        style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--color-text-muted)', padding: 4 }}>×</button>
    </div>
  );
}

function PanelBody({ content }) {
  if (content.type === 'result') {
    return (
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <ResultDetail result={content.data} />
      </div>
    );
  }
  return <div style={{ padding: 16, color: 'var(--color-text-muted)', fontSize: 13 }}>未支持的内容类型</div>;
}
