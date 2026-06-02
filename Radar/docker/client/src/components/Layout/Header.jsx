import { useState, useEffect } from 'react';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import CommandPaletteOverlay from './CommandPaletteOverlay';

export default function Header({ onNewTask }) {
  const { state, dispatch } = useWorkspace();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false);

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

  // Auto-focus and Escape handling moved to CommandPaletteOverlay

  return (
    <header className="app-header" style={{ gridArea: 'header', background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12, zIndex: 50, height: 'var(--header-height)' }}>
      {/* Hamburger — visible only on mobile */}
      <button className="header__hamburger" onClick={() => setSidebarMobileOpen(o => !o)}
        style={{ display: 'none', background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', padding: 4 }}>
        ☰
      </button>

      {/* Logo + app name */}
      <span style={{ fontWeight: 700, fontSize: 18, cursor: 'pointer', whiteSpace: 'nowrap' }}
        onClick={() => { dispatch({ type: 'CLOSE_TASK' }); window.location.hash = '#'; }}>
        雷达
      </span>

      {/* Command palette trigger */}
      <div style={{ flex: 1, maxWidth: 400, margin: '0 auto', position: 'relative' }}>
        <button onClick={() => setPaletteOpen(true)}
          style={{ width: '100%', padding: '6px 12px', border: '1px solid var(--color-border)', borderRadius: 6, background: 'var(--color-bg)', cursor: 'pointer', fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>🔍</span>
          <span>搜索任务或输入命令...</span>
          <kbd style={{ marginLeft: 'auto', padding: '1px 6px', background: '#e2e8f0', borderRadius: 4, fontSize: 11 }}>Ctrl+K</kbd>
        </button>
      </div>

      {/* Right group */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={() => { dispatch({ type: 'SET_VIEW', payload: 'config' }); window.location.hash = '#/config'; }}
          style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', padding: 6, borderRadius: 6, color: 'var(--color-text-muted)' }}
          title="配置">
          ⚙
        </button>
      </div>

      {/* Command palette overlay */}
      {paletteOpen && <CommandPaletteOverlay onClose={() => setPaletteOpen(false)} />}
    </header>
  );
}
