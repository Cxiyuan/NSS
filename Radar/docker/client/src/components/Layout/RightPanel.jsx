import { useWorkspace } from '../../contexts/WorkspaceContext';
import ResultDetail from '../ResultDetail';
import './RightPanel.css';

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
          <PanelBody content={content} />
        </div>
      </div>
    );
  }

  // Split-pane mode for 1440px+
  return (
    <div className="right-split-pane">
      <PanelHeader content={content} onClose={() => dispatch({ type: 'CLOSE_RIGHT_PANEL' })} pinned={state.rightPanelPinned}
        onTogglePin={() => dispatch({ type: 'TOGGLE_PIN' })} />
      <PanelBody content={content} />
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

function PanelBody({ content }) {
  if (content.type === 'result') {
    return (
      <div className="panel-body">
        <ResultDetail result={content.data} />
      </div>
    );
  }
  return <div className="panel-body text-muted" style={{ fontSize: 13 }}>未支持的内容类型</div>;
}
