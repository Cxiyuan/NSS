import { useWorkspace } from '../../contexts/WorkspaceContext';
import ResultDetail from '../ResultDetail';
import './RightPanel.css';

function getHostname(url) {
  try { return new URL(url).hostname; } catch { return null; }
}

async function addDomainFilter(taskId, domain) {
  try {
    await fetch(`/api/tasks/${taskId}/filters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain }),
    });
  } catch (err) {
    console.error('Failed to add filter:', err);
  }
}

export default function RightPanel() {
  const { state, dispatch } = useWorkspace();
  if (!state.rightPanelContent) return null;

  const content = state.rightPanelContent;
  const isSplit = window.innerWidth >= 1025;

  if (!isSplit) {
    // Overlay mode for <1024px
    return (
      <div className="right-panel-overlay" onClick={() => dispatch({ type: 'CLOSE_RIGHT_PANEL' })}>
        <div className="right-panel-drawer" onClick={e => e.stopPropagation()}>
          <PanelHeader content={content} onClose={() => dispatch({ type: 'CLOSE_RIGHT_PANEL' })} pinned={state.rightPanelPinned}
            onTogglePin={() => dispatch({ type: 'TOGGLE_PIN' })} />
          <PanelBody content={content} state={state} dispatch={dispatch} />
        </div>
      </div>
    );
  }

  // Split-pane mode for 1440px+
  return (
    <div className="right-split-pane">
      <PanelHeader content={content} onClose={() => dispatch({ type: 'CLOSE_RIGHT_PANEL' })} pinned={state.rightPanelPinned}
        onTogglePin={() => dispatch({ type: 'TOGGLE_PIN' })} />
      <PanelBody content={content} state={state} dispatch={dispatch} />
    </div>
  );
}

function PanelHeader({ content, onClose, pinned, onTogglePin }) {
  return (
    <div className="panel-header">
      <span className="panel-header__title">
        {content.data?.url || '详情'}
      </span>
      <button onClick={onTogglePin} title="固定面板"
        className={`panel-header__btn${pinned ? ' panel-header__btn--active' : ''}`}>📌</button>
      <button onClick={onClose}
        className="panel-header__btn">×</button>
    </div>
  );
}

function PanelBody({ content, state, dispatch }) {
  if (content.type === 'result') {
    return (
      <div className="panel-body">
        {content.data?.url && (() => {
          const hostname = getHostname(content.data.url);
          if (!hostname) return null;
          return (
            <div className="panel-domain-filter">
              <div className="panel-domain-filter__info">
                <span className="panel-domain-filter__label">域名</span>
                <span className="panel-domain-filter__value">{hostname}</span>
              </div>
              <button className="btn btn--primary" style={{ fontSize: 12, padding: '4px 10px' }}
                onClick={() => addDomainFilter(state.activeTaskId, hostname)}>
                + 加入过滤
              </button>
            </div>
          );
        })()}
        <ResultDetail result={content.data} />
      </div>
    );
  }
  return <div className="panel-body text-muted" style={{ fontSize: 13 }}>未支持的内容类型</div>;
}
