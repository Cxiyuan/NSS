import { useState } from 'react';
import FilterInput from '../FilterInput';
import './UnifiedTaskForm.css';

export default function UnifiedTaskForm({ onStart }) {
  const [mode, setMode] = useState('url_crawl');
  const [url, setUrl] = useState('');
  const [keywords, setKeywords] = useState('');
  const [depth, setDepth] = useState(3);
  const [concurrency, setConcurrency] = useState(3);
  const [filters, setFilters] = useState({ domains: [], types: [] });
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    const config = { depth: Number(depth), concurrency: Number(concurrency), filters };
    if (mode === 'url_crawl') {
      let u = url.trim();
      if (!u) return;
      if (!u.includes('://')) u = 'https://' + u;
      config.url = u;
    } else {
      const kw = keywords.trim();
      if (!kw) return;
      config.keywords = kw;
    }
    setSubmitting(true);
    try {
      await onStart({ ...config, type: mode });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="task-form">
      {/* Mode toggle */}
      <div className="task-form__mode-toggle">
        {['url_crawl', 'keyword_search'].map(m => (
          <button key={m} type="button" onClick={() => setMode(m)}
            className={`task-form__mode-btn${mode === m ? ' task-form__mode-btn--active' : ''}`}>
            {m === 'url_crawl' ? '\u{1F517} \u{5916}\u{94FE}\u{63A2}\u{6D4B}' : '\u{1F50D} \u{5173}\u{952E}\u{8BCD}\u{641C}\u{7D22}'}
          </button>
        ))}
      </div>

      {/* Mode-specific fields */}
      {mode === 'url_crawl' ? (
        <div className="task-form__field">
          <label className="task-form__label" htmlFor="task-form-url">目标站点</label>
          <input id="task-form-url" type="text" value={url} onChange={e => setUrl(e.target.value)}
            placeholder="https://example.com"
            className="task-form__input" required
            aria-required="true" />
        </div>
      ) : (
        <>
          <div className="task-form__field">
            <label className="task-form__label" htmlFor="task-form-keywords">关键词</label>
            <input id="task-form-keywords" type="text" value={keywords} onChange={e => setKeywords(e.target.value)}
              placeholder="输入搜索关键词，引号包裹精确短语"
              className="task-form__input" required
              aria-required="true" />
          </div>
        </>
      )}

      {/* Shared fields */}
      <div className="task-form__row">
        <div className="task-form__field">
          <label className="task-form__label" htmlFor="task-form-depth">探测深度</label>
          <input id="task-form-depth" type="number" min={1} max={10} value={depth} onChange={e => setDepth(e.target.value)}
            className="task-form__input"
            aria-describedby="task-form-depth-hint" />
          <span id="task-form-depth-hint" hidden>范围 1-10，越大越深</span>
        </div>
        <div className="task-form__field">
          <label className="task-form__label" htmlFor="task-form-concurrency">并发数</label>
          <input id="task-form-concurrency" type="number" min={1} max={20} value={concurrency} onChange={e => setConcurrency(e.target.value)}
            className="task-form__input"
            aria-describedby="task-form-concurrency-hint" />
          <span id="task-form-concurrency-hint" hidden>范围 1-20，越大越快但更耗资源</span>
        </div>
      </div>

      {/* Filters */}
      <div className="task-form__field">
        <label className="task-form__label">过滤条件</label>
        <FilterInput filters={filters} onChange={setFilters} />
      </div>

      {/* Submit */}
      <button type="submit" disabled={submitting}
        className="task-form__submit">
        {submitting ? '创建中...' : mode === 'url_crawl' ? '开始探测' : '开始搜索并探测'}
      </button>
    </form>
  );
}
