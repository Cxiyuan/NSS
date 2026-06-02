import { useState } from 'react';

const LINK_TYPE_LABELS = {
  a: '超链接', img: '图片', link: '资源引用', iframe: '内嵌框架',
  form: '表单', meta: '页面跳转', script: '脚本', js_dynamic: 'JS动态',
  css: '样式表', comment: '注释', keyword_match: '关键词匹配',
};

const VALID_PATTERN = /^(\*\.)?[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}$|^\*[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}$/;

export default function FilterInput({ filters = { domains: [], types: [] }, onChange }) {
  const [mode, setMode] = useState('domain');
  const [domainText, setDomainText] = useState(
    Array.isArray(filters) ? filters.join('\n') : (filters.domains || []).join('\n')
  );
  const [error, setError] = useState('');

  // Normalize old array format to new object format
  const currentFilters = Array.isArray(filters) ? { domains: filters, types: [] } : filters;
  const selectedTypes = currentFilters.types || [];
  const domains = Array.isArray(filters) ? filters : (currentFilters.domains || []);

  function handleDomainChange(text) {
    setDomainText(text);
    setError('');
    const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
    // Validate each line
    const invalid = lines.filter(l => !VALID_PATTERN.test(l));
    if (invalid.length > 0) {
      setError(`格式无效: ${invalid[0]}`);
      return;
    }
    const deduped = [...new Set(lines)];
    onChange({ domains: deduped, types: selectedTypes });
  }

  function toggleType(type) {
    const updated = selectedTypes.includes(type)
      ? selectedTypes.filter(t => t !== type)
      : [...selectedTypes, type];
    onChange({ domains, types: updated });
  }

  return (
    <div className="filter-input">
      {/* Mode tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 10, borderBottom: '1px solid var(--color-border)' }}>
        <button type="button" onClick={() => setMode('domain')}
          style={{ flex: 1, padding: '6px 12px', border: 'none', background: mode === 'domain' ? 'var(--color-primary)' : 'transparent', color: mode === 'domain' ? 'white' : 'var(--color-text-muted)', borderRadius: '4px 4px 0 0', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
          域名过滤 {domains.length > 0 ? `(${domains.length})` : ''}
        </button>
        <button type="button" onClick={() => setMode('type')}
          style={{ flex: 1, padding: '6px 12px', border: 'none', background: mode === 'type' ? 'var(--color-primary)' : 'transparent', color: mode === 'type' ? 'white' : 'var(--color-text-muted)', borderRadius: '4px 4px 0 0', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
          类型过滤 {selectedTypes.length > 0 ? `(${selectedTypes.length})` : ''}
        </button>
      </div>

      {mode === 'domain' ? (
        <div>
          <textarea value={domainText} onChange={e => handleDomainChange(e.target.value)}
            placeholder="输入要过滤的域名，每行一个&#10;如: qq.com&#10;    *.qq.com&#10;    *gov.cn"
            style={{ width: '100%', minHeight: 80, padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 13, fontFamily: 'var(--font-mono, monospace)', resize: 'vertical', boxSizing: 'border-box' }}
          />
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
            支持格式: qq.com（精确域名）, *.qq.com（泛域名）, *gov.cn（后缀通配）
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
          {Object.entries(LINK_TYPE_LABELS).map(([type, label]) => (
            <label key={type} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
              <input type="checkbox" checked={selectedTypes.includes(type)}
                onChange={() => toggleType(type)}
                style={{ accentColor: 'var(--color-primary)' }} />
              {label}
            </label>
          ))}
        </div>
      )}

      {error && <div className="filter-input__error">{error}</div>}

      {/* Active filters summary */}
      {(domains.length > 0 || selectedTypes.length > 0) && (
        <div className="filter-input__tags" style={{ marginTop: 8 }}>
          {domains.map(f => (
            <span key={f} className="filter-input__tag">
              {f}
              <button type="button" onClick={() => {
                const updated = domains.filter(d => d !== f);
                const newText = updated.join('\n');
                setDomainText(newText);
                onChange({ domains: updated, types: selectedTypes });
              }} className="filter-input__tag-remove">&times;</button>
            </span>
          ))}
          {selectedTypes.map(t => (
            <span key={t} className="filter-input__tag">
              {LINK_TYPE_LABELS[t]} ({t})
              <button type="button" onClick={() => toggleType(t)} className="filter-input__tag-remove">&times;</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
