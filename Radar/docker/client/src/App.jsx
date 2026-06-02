import { useState, useEffect, useCallback } from 'react';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider } from './components/ToastContext';
import UrlCrawlPage from './pages/UrlCrawlPage';
import KeywordSearchPage from './pages/KeywordSearchPage';
import ConfigPage from './pages/ConfigPage';
import './App.css';

const TAB_TITLES = {
  url: '外链探测',
  keyword: '关键词搜索',
  config: '配置',
};

function getInitialTab() {
  const hash = location.hash.replace('#', '');
  if (hash in TAB_TITLES) return hash;
  return 'url';
}

export default function App() {
  const [tab, setTab] = useState(getInitialTab);

  useEffect(() => {
    const onHashChange = () => {
      const hash = location.hash.replace('#', '');
      if (hash in TAB_TITLES) {
        setTab(hash);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    document.title = `雷达 - ${TAB_TITLES[tab]}`;
  }, [tab]);

  const handleTabClick = useCallback((t) => {
    location.hash = t;
  }, []);

  return (
    <ErrorBoundary>
      <ToastProvider>
        <div className="app">
          <header className="app__header">
            <h1>雷达</h1>
            <nav className="app__nav" role="tablist">
              {Object.entries(TAB_TITLES).map(([key, label]) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={tab === key}
                  className={`app__tab ${tab === key ? 'app__tab--active' : ''}`}
                  onClick={() => handleTabClick(key)}
                >
                  {label}
                </button>
              ))}
            </nav>
          </header>

          <main>
            {tab === 'url' && (
              <div role="tabpanel">
                <UrlCrawlPage />
              </div>
            )}
            {tab === 'keyword' && (
              <div role="tabpanel">
                <KeywordSearchPage />
              </div>
            )}
            {tab === 'config' && (
              <div role="tabpanel">
                <ConfigPage />
              </div>
            )}
          </main>
        </div>
      </ToastProvider>
    </ErrorBoundary>
  );
}
