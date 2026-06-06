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
      <div className="filter-mode">
        <button type="button" className={'filter-mode__tab' + (mode === 'domain' ? ' filter-mode__tab--active' : '')} onClick={() => setMode('domain')}>
          域名过滤 {domains.length > 0 ? `(${domains.length})` : ''}
        </button>
        <button type="button" className={'filter-mode__tab' + (mode === 'type' ? ' filter-mode__tab--active' : '')} onClick={() => setMode('type')}>
          类型过滤 {selectedTypes.length > 0 ? `(${selectedTypes.length})` : ''}
        </button>
      </div>

      {mode === 'domain' ? (
        <div>
          <textarea className="filter-domain__input" value={domainText} onChange={e => handleDomainChange(e.target.value)}
            placeholder="输入要过滤的域名，每行一个&#10;如: qq.com&#10;    *.qq.com&#10;    *gov.cn" />
          <div className="filter-domain__hint">
            支持格式: qq.com（精确域名）, *.qq.com（泛域名）, *gov.cn（后缀通配）
          </div>
        </div>
      ) : (
        <div className="filter-type__grid" role="group" aria-label="按链接类型过滤">
          {Object.entries(LINK_TYPE_LABELS).map(([type, label]) => (
            <label key={type} className="filter-type__item">
              <input
                type="checkbox"
                checked={selectedTypes.includes(type)}
                onChange={() => toggleType(type)}
                aria-label={`过滤类型 ${label}`} />
              <span>{label}</span>
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
              <button
                type="button"
                onClick={() => toggleType(t)}
                aria-label={`移除过滤类型 ${LINK_TYPE_LABELS[t]}`}
                className="filter-input__tag-remove">&times;</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
