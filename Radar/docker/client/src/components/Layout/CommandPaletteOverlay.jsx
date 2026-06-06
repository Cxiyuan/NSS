import { useState, useRef, useEffect } from 'react';
import { useWorkspace } from '../../contexts/WorkspaceContext';

export default function CommandPaletteOverlay({ onClose }) {
  const { state, dispatch } = useWorkspace();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 50); }, []);

  useEffect(() => {
    function handler(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const actions = [
    { id: 'new-url', label: '新建 URL 爬取任务', icon: '🔗', keywords: 'new url crawl', action: () => { window.location.hash = '#/new'; onClose(); } },
    { id: 'new-keyword', label: '新建关键词搜索任务', icon: '🔍', keywords: 'new keyword search', action: () => { window.location.hash = '#/new'; onClose(); } },
    { id: 'config', label: '打开配置页面', icon: '⚙', keywords: 'config settings', action: () => { window.location.hash = '#/config'; onClose(); } },
    { id: 'analytics', label: '查看全局分析', icon: '📊', keywords: 'analytics dashboard stats', action: () => { window.location.hash = '#/analytics'; onClose(); } },
  ];

  // Reset selectedIndex when query changes
  useEffect(() => { setSelectedIndex(0); }, [query]);

  const filtered = query.trim()
    ? actions.filter(a => a.label.toLowerCase().includes(query.toLowerCase()) || a.keywords.toLowerCase().includes(query.toLowerCase()))
    : actions;

  function handleKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => (i + 1) % filtered.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => (i - 1 + filtered.length) % filtered.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        filtered[selectedIndex].action();
      }
    }
  }

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 200, display: 'flex', justifyContent: 'center', paddingTop: '15vh' }}>
      <div
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        onClick={e => e.stopPropagation()}
        role="combobox"
        aria-expanded="true"
        aria-haspopup="listbox"
        aria-owns="command-palette-listbox"
        style={{ background: 'white', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.15)', width: '100%', maxWidth: 520, display: 'flex', flexDirection: 'column', overflow: 'hidden', maxHeight: 400 }}>
        <label htmlFor="command-palette-input" hidden>搜索命令</label>
        <input
          id="command-palette-input"
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="搜索命令..."
          role="searchbox"
          aria-label="搜索命令"
          aria-autocomplete="list"
          aria-controls="command-palette-listbox"
          style={{ padding: '14px 16px', border: 'none', fontSize: 15, outline: 'none', width: '100%', boxSizing: 'border-box' }} />
        <div id="command-palette-listbox" role="listbox" aria-label="命令列表" style={{ maxHeight: 300, overflow: 'auto', borderTop: '1px solid var(--color-border)' }}>
          {filtered.map((action, i) => (
            <div key={action.id} onClick={action.action}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', cursor: 'pointer', fontSize: 14, transition: 'background 0.1s', background: i === selectedIndex ? '#e2e8f0' : 'transparent' }}
              onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
              onMouseLeave={e => e.currentTarget.style.background = i === selectedIndex ? '#e2e8f0' : 'transparent'}>
              <span>{action.icon}</span>
              <span>{action.label}</span>
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>未找到匹配的命令</div>
          )}
        </div>
        <div style={{ padding: '8px 16px', borderTop: '1px solid var(--color-border)', fontSize: 12, color: 'var(--color-text-muted)', display: 'flex', gap: 16, justifyContent: 'center' }}>
          <span>↑↓ 导航</span><span>↵ 选择</span><span>Esc 关闭</span>
        </div>
      </div>
    </div>
  );
}
