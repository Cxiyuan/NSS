import { useState } from 'react';
import FilterInput from '../FilterInput';

export default function UnifiedTaskForm({ onStart }) {
  const [mode, setMode] = useState('url_crawl');
  const [url, setUrl] = useState('');
  const [keywords, setKeywords] = useState('');
  const [depth, setDepth] = useState(3);
  const [concurrency, setConcurrency] = useState(3);
  const [filters, setFilters] = useState([]);
  const [searchEngine, setSearchEngine] = useState('google');
  const [searchApiKey, setSearchApiKey] = useState('');
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
      config.searchEngine = searchEngine;
      config.searchApiKey = searchApiKey.trim();
    }
    setSubmitting(true);
    try {
      await onStart({ ...config, type: mode });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 560, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: 24, boxShadow: 'var(--shadow)' }}>
      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: '#f1f5f9', borderRadius: 6, padding: 3 }}>
        {['url_crawl', 'keyword_search'].map(m => (
          <button key={m} type="button" onClick={() => setMode(m)}
            style={{ flex: 1, padding: '8px 16px', border: 'none', borderRadius: 4, fontWeight: 600, fontSize: 13, cursor: 'pointer', background: mode === m ? 'white' : 'transparent', color: mode === m ? 'var(--color-primary)' : 'var(--color-text-muted)', boxShadow: mode === m ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
            {m === 'url_crawl' ? '\u{1F517} 外链探测' : '\u{1F50D} 关键词搜索'}
          </button>
        ))}
      </div>

      {/* Mode-specific fields */}
      {mode === 'url_crawl' ? (
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--color-text-muted)', marginBottom: 4 }}>目标站点</label>
          <input type="text" value={url} onChange={e => setUrl(e.target.value)}
            placeholder="https://example.com"
            style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }} required />
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--color-text-muted)', marginBottom: 4 }}>关键词</label>
            <input type="text" value={keywords} onChange={e => setKeywords(e.target.value)}
              placeholder="输入搜索关键词，引号包裹精确短语"
              style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }} required />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--color-text-muted)', marginBottom: 4 }}>搜索引擎</label>
              <select value={searchEngine} onChange={e => setSearchEngine(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 14, background: 'white' }}>
                <option value="google">Google</option>
                <option value="bing">Bing</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--color-text-muted)', marginBottom: 4 }}>API 密钥</label>
              <input type="password" value={searchApiKey} onChange={e => setSearchApiKey(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }} />
            </div>
          </div>
        </>
      )}

      {/* Shared fields */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--color-text-muted)', marginBottom: 4 }}>探测深度</label>
          <input type="number" min={1} max={10} value={depth} onChange={e => setDepth(e.target.value)}
            style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--color-text-muted)', marginBottom: 4 }}>并发数</label>
          <input type="number" min={1} max={20} value={concurrency} onChange={e => setConcurrency(e.target.value)}
            style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }} />
        </div>
      </div>

      {/* Filters */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--color-text-muted)', marginBottom: 4 }}>过滤条件</label>
        <FilterInput filters={filters} onChange={setFilters} />
      </div>

      {/* Submit */}
      <button type="submit" disabled={submitting}
        style={{ width: '100%', padding: 10, background: submitting ? '#93c5fd' : 'var(--color-primary)', color: 'white', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer' }}>
        {submitting ? '创建中...' : mode === 'url_crawl' ? '开始探测' : '开始搜索并探测'}
      </button>
    </form>
  );
}
