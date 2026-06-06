import { useState, useEffect } from 'react';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import CommandPaletteOverlay from './CommandPaletteOverlay';
import './Header.css';

export default function Header({ onNewTask }) {
  const { state, dispatch } = useWorkspace();
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Listen for Cmd+K / Ctrl+K global shortcut
  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <header className="header app-header" role="banner">
      {/* Hamburger — visible only on mobile */}
      <button
        className="header__hamburger"
        aria-label={state.mobileSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
        aria-expanded={state.mobileSidebarOpen}
        onClick={() => dispatch({ type: 'SET_MOBILE_SIDEBAR', payload: !state.mobileSidebarOpen })}>
        ☰
      </button>

      {/* Logo + app name */}
      <span
        className="header__logo"
        role="link"
        tabIndex={0}
        aria-label="Go to home"
        onClick={() => { window.location.hash = '#'; }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.location.hash = '#'; } }}>
        雷达
      </span>

      {/* Command palette trigger */}
      <div className="header__palette">
        <button
          onClick={() => setPaletteOpen(true)}
          className="header__palette-btn"
          aria-label="Open command palette (Ctrl+K)"
          aria-haspopup="dialog">
          <span aria-hidden="true">🔍</span>
          <span>搜索任务或输入命令...</span>
          <kbd className="header__kbd" aria-hidden="true">Ctrl+K</kbd>
        </button>
      </div>

      {/* Right group */}
      <div className="header__actions">
        <button
          onClick={() => { window.location.hash = '#/config'; }}
          className="header__gear"
          aria-label="Open configuration">
          ⚙
        </button>
      </div>

      {/* Command palette overlay */}
      {paletteOpen && <CommandPaletteOverlay onClose={() => setPaletteOpen(false)} />}
    </header>
  );
}
