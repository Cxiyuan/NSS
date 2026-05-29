import { useState } from 'react';

export default function FilterInput({ filters = [], onChange }) {
  const [input, setInput] = useState('');

  function addFilter() {
    const val = input.trim();
    if (!val) return;
    if (filters.includes(val)) return;
    onChange?.([...filters, val]);
    setInput('');
  }

  function removeFilter(filter) {
    onChange?.(filters.filter(f => f !== filter));
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
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. qq.com, *.qq.com, *gov.cn"
          className="filter-input__field"
        />
        <button type="button" onClick={addFilter} className="filter-input__add-btn">
          + Add Filter
        </button>
      </div>

      {filters.length > 0 && (
        <div className="filter-input__tags">
          {filters.map(f => (
            <span key={f} className="filter-input__tag">
              {f}
              <button
                type="button"
                onClick={() => removeFilter(f)}
                className="filter-input__tag-remove"
                aria-label={`Remove filter ${f}`}
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
