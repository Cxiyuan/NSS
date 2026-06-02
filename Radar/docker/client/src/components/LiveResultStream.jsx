import { LINK_TYPE_LABELS } from '../lib/constants';
import { truncate } from '../lib/utils';

export default function LiveResultStream({ results = [] }) {
  if (results.length === 0) return null;

  return (
    <div className="live-stream">
      <div className="live-stream__header">
        <span className="live-stream__dot" />
        实时推送（最近 {results.length} 条）
      </div>
      <div className="live-stream__body">
        {results.map((r, i) => (
          <div key={r._key ?? r.id ?? i} className="live-stream__item">
            <a href={r.url} target="_blank" rel="noreferrer" className="live-stream__url" title={r.page_title || ''}>
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
