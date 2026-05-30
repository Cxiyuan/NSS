import { useRef, useEffect } from 'react';

function truncate(str, max) {
  if (!str || str.length <= max) return str;
  return str.slice(0, max) + '...';
}

export default function LiveResultStream({ results = [] }) {
  const listRef = useRef(null);

  // Auto-scroll to top when new results arrive
  useEffect(() => {
    if (listRef.current && results.length > 0) {
      listRef.current.scrollTop = 0;
    }
  }, [results.length]);

  if (results.length === 0) return null;

  return (
    <div className="live-stream">
      <div className="live-stream__header">
        <span className="live-stream__dot" />
        实时推送（最近 {results.length} 条）
      </div>
      <div className="live-stream__body" ref={listRef}>
        {results.map((r, i) => (
          <div key={r.id ?? i} className="live-stream__item">
            <a href={r.url} target="_blank" rel="noreferrer" className="live-stream__url">
              {truncate(r.url, 55)}
            </a>
            <span className={`link-type link-type--${r.link_type}`}>{r.link_type}</span>
            <span className="live-stream__depth">d:{r.depth}</span>
          </div>
        ))}
      </div>
    </div>
  );
}