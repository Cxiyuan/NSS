import { useState } from 'react';
import FilterInput from './FilterInput';

export default function TaskForm({ type, onSubmit, disabled }) {
  const [url, setUrl] = useState('');
  const [keywords, setKeywords] = useState('');
  const [depth, setDepth] = useState(3);
  const [concurrency, setConcurrency] = useState(3);
  const [filters, setFilters] = useState([]);
  const [searchEngine, setSearchEngine] = useState('google');
  const [searchApiKey, setSearchApiKey] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    const config = { type, depth: Number(depth), concurrency: Number(concurrency), filters };
    if (type === 'url_crawl') {
      let u = url.trim();
      if (!u) return;
      // Auto-prepend https:// if no protocol specified
      if (!u.startsWith('http://') && !u.startsWith('https://')) {
        u = 'https://' + u;
      }
      config.url = u;
    } else {
      config.keywords = keywords.trim();
      if (!config.keywords) return;
      config.searchEngine = searchEngine;
      config.searchApiKey = searchApiKey.trim();
    }
    onSubmit(config);
  }

  return (
    <form onSubmit={handleSubmit} className="task-form">
      {type === 'url_crawl' ? (
        <div className="task-form__field">
          <label htmlFor="tf-url">探测站点</label>
          <input
            id="tf-url"
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://example.com"
            required
          />
        </div>
      ) : (
        <>
          <div className="task-form__field">
            <label htmlFor="tf-keywords">关键词</label>
            <input
              id="tf-keywords"
              type="text"
              value={keywords}
              onChange={e => setKeywords(e.target.value)}
              placeholder="输入搜索关键词"
              required
            />
          </div>
          <div className="task-form__row">
            <div className="task-form__field">
              <label htmlFor="tf-engine">搜索引擎</label>
              <select id="tf-engine" value={searchEngine} onChange={e => setSearchEngine(e.target.value)}>
                <option value="google">Google</option>
                <option value="bing">Bing</option>
              </select>
            </div>
            <div className="task-form__field">
              <label htmlFor="tf-apikey">API 密钥</label>
              <input
                id="tf-apikey"
                type="password"
                value={searchApiKey}
                onChange={e => setSearchApiKey(e.target.value)}
                placeholder={searchEngine === 'google' ? 'Google API Key' : 'Bing API Key'}
              />
            </div>
          </div>
        </>
      )}

      <div className="task-form__row">
        <div className="task-form__field">
          <label htmlFor="tf-depth">探测深度</label>
          <input id="tf-depth" type="number" min={1} max={10} value={depth} onChange={e => setDepth(e.target.value)} />
        </div>
        <div className="task-form__field">
          <label htmlFor="tf-concurrency">并发数</label>
          <input id="tf-concurrency" type="number" min={1} max={20} value={concurrency} onChange={e => setConcurrency(e.target.value)} />
        </div>
      </div>

      <div className="task-form__field">
        <label>过滤条件</label>
        <FilterInput filters={filters} onChange={setFilters} />
      </div>

      <button type="submit" className="task-form__submit" disabled={disabled}>
        {type === 'url_crawl' ? '开始探测' : '开始搜索并探测'}
      </button>
    </form>
  );
}
