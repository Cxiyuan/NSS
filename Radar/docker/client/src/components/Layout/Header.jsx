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
    <header className="header app-header">
      {/* Hamburger — visible only on mobile */}
      <button className="header__hamburger"
        onClick={() => dispatch({ type: 'SET_MOBILE_SIDEBAR', payload: !state.mobileSidebarOpen })}>
        ☰
      </button>

      {/* Logo + app name */}
      <span className="header__logo"
        onClick={() => { window.location.hash = '#'; }}>
        雷达
      </span>

      {/* Command palette trigger */}
      <div className="header__palette">
        <button onClick={() => setPaletteOpen(true)} className="header__palette-btn">
          <span>🔍</span>
          <span>搜索任务或输入命令...</span>
          <kbd className="header__kbd">Ctrl+K</kbd>
        </button>
      </div>

      {/* Right group */}
      <div className="header__actions">
        <button onClick={() => { window.location.hash = '#/config'; }}
          className="header__gear"
          title="配置">
          ⚙
        </button>
      </div>

      {/* Command palette overlay */}
      {paletteOpen && <CommandPaletteOverlay onClose={() => setPaletteOpen(false)} />}
    </header>
  );
}
