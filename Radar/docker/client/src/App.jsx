import { useState } from 'react';
import UrlCrawlPage from './pages/UrlCrawlPage';
import KeywordSearchPage from './pages/KeywordSearchPage';
import './App.css';

export default function App() {
  const [tab, setTab] = useState('url');

  return (
    <div className="app">
      <header className="app__header">
        <h1>Web Crawler</h1>
        <nav className="app__nav">
          <button
            className={`app__tab ${tab === 'url' ? 'app__tab--active' : ''}`}
            onClick={() => setTab('url')}
          >
            URL Crawl
          </button>
          <button
            className={`app__tab ${tab === 'keyword' ? 'app__tab--active' : ''}`}
            onClick={() => setTab('keyword')}
          >
            Keyword Search
          </button>
        </nav>
      </header>

      <main>
        {tab === 'url' ? <UrlCrawlPage /> : <KeywordSearchPage />}
      </main>
    </div>
  );
}
