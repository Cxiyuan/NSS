import { useRef, useEffect } from 'react';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { LINK_TYPE_LABELS } from '../../lib/constants';

function truncate(str, max) {
  if (!str || str.length <= max) return str;
  return str.slice(0, max) + '...';
}

export default function LiveResultStream({ results = [] }) {
  const { dispatch } = useWorkspace();
  const listRef = useRef(null);

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
          <div key={r.id ?? `${r.url}-${i}`} className="live-stream__item">
            <a href={r.url} target="_blank" rel="noreferrer" className="live-stream__url" title={r.page_title || ''}
              onClick={(e) => { e.stopPropagation(); dispatch({ type: 'OPEN_RIGHT_PANEL', payload: { type: 'result', data: r } }); }}>
              {r.page_title ? truncate(r.page_title, 40) : truncate(r.url, 55)}
            </a>
            {r.status_code ? <span className="live-stream__status">{r.status_code}</span> : null}
            <span className={`link-type link-type--${r.link_type}`}>{LINK_TYPE_LABELS[r.link_type] || r.link_type}</span>
            <span className="live-stream__depth">d:{r.depth}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
