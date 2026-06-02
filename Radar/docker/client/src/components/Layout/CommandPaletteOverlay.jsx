import { useState, useRef, useEffect } from 'react';
import { useWorkspace } from '../../contexts/WorkspaceContext';

export default function CommandPaletteOverlay({ onClose }) {
  const { state, dispatch } = useWorkspace();
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 50); }, []);

  useEffect(() => {
    function handler(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const actions = [
    { id: 'new-url', label: '新建 URL 爬取任务', icon: '🔗', keywords: 'new url crawl', action: () => { window.location.hash = '#/'; onClose(); } },
    { id: 'new-keyword', label: '新建关键词搜索任务', icon: '🔍', keywords: 'new keyword search', action: () => { window.location.hash = '#/'; onClose(); } },
    { id: 'config', label: '打开配置页面', icon: '⚙', keywords: 'config settings', action: () => { window.location.hash = '#/config'; onClose(); } },
    { id: 'analytics', label: '查看全局分析', icon: '📊', keywords: 'analytics dashboard stats', action: () => { window.location.hash = '#/analytics'; onClose(); } },
  ];

  const filtered = query.trim()
    ? actions.filter(a => a.label.includes(query) || a.keywords.includes(query.toLowerCase()))
    : actions;

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 200, display: 'flex', justifyContent: 'center', paddingTop: '15vh' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.15)', width: '100%', maxWidth: 520, display: 'flex', flexDirection: 'column', overflow: 'hidden', maxHeight: 400 }}>
        <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
          placeholder="搜索命令..."
          style={{ padding: '14px 16px', border: 'none', fontSize: 15, outline: 'none', width: '100%', boxSizing: 'border-box' }} />
        <div style={{ maxHeight: 300, overflow: 'auto', borderTop: '1px solid var(--color-border)' }}>
          {filtered.map(action => (
            <div key={action.id} onClick={action.action}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', cursor: 'pointer', fontSize: 14, transition: 'background 0.1s' }}
              onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
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
