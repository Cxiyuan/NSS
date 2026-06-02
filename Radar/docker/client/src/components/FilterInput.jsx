import { useState } from 'react';

// Valid patterns: exact domain, *.subdomain, *suffix
const VALID_PATTERN = /^(\*\.)?[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}$|^\*[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}$/;

export default function FilterInput({ filters = [], onChange }) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  function addFilter() {
    const val = input.trim();
    setError('');
    if (!val) return;
    if (filters.includes(val)) {
      setError('该过滤条件已存在');
      return;
    }
    if (!VALID_PATTERN.test(val)) {
      setError('格式无效 — 请使用如 qq.com、*.qq.com、*gov.cn');
      return;
    }
    onChange?.([...filters, val]);
    setInput('');
  }

  function removeFilter(filter) {
    onChange?.(filters.filter(f => f !== filter));
  }

  function handleChange(e) {
    setInput(e.target.value);
    if (error) setError('');
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addFilter();
    }
  }

  return (
    <div className="filter-input">
      <div className="filter-input__row">
        <input
          type="text"
          value={input}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="输入域名 如 qq.com, *.qq.com, *gov.cn"
          className="filter-input__field"
        />
        <button type="button" onClick={addFilter} className="filter-input__add-btn">
          + 添加过滤
        </button>
      </div>

      {error && <div className="filter-input__error">{error}</div>}

      {filters.length > 0 && (
        <div className="filter-input__tags">
          {filters.map(f => (
            <span key={f} className="filter-input__tag">
              {f}
              <button
                type="button"
                onClick={() => removeFilter(f)}
                className="filter-input__tag-remove"
                aria-label={`移除过滤 ${f}`}
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
