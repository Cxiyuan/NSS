import { useState, useCallback, useRef, useEffect } from 'react';
import ResultDetail from './ResultDetail';
import { LINK_TYPE_LABELS } from '../lib/constants';
import { truncate } from '../lib/utils';

function linkTypeLabel(type) {
  return LINK_TYPE_LABELS[type] || type;
}

function SkeletonRows({ count, columns }) {
  return Array.from({ length: count }, (_, i) => (
    <tr key={i}>
      {Array.from({ length: columns }, (_, j) => (
        <td key={j}>
          <div className="skeleton" style={{ height: 16, width: `${50 + (j * 10) % 40}%` }} />
        </td>
      ))}
    </tr>
  ));
}

export default function ResultTable({ results, total, page, limit, onPageChange, error, loading }) {
  const [selected, setSelected] = useState(null);
  const wrapperRef = useRef(null);
  const totalPages = Math.ceil(total / limit);

  useEffect(() => {
    if (wrapperRef.current) {
      wrapperRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [page]);

  const columns = [
    { key: 'url', label: 'URL', render: r => <a href={r.url} target="_blank" rel="noreferrer" className="result-table__link">{truncate(r.url, 60)}</a> },
    { key: 'page_title', label: '标题/状态', render: r => (
      <span className={`result-table__title ${!r.page_title && r.status_code ? 'result-table__title--error' : ''}`}>
        {r.page_title || (r.status_code ? `HTTP ${r.status_code}` : '—')}
      </span>
    )},
    { key: 'found_on', label: '来源页面', render: r => truncate(r.found_on, 40) },
    { key: 'link_type', label: '类型', render: r => <span className={`link-type link-type--${r.link_type}`}>{linkTypeLabel(r.link_type)}</span> },
    { key: 'depth', label: '深度', render: r => r.depth },
  ];

  const handleRowClick = useCallback((r) => {
    setSelected(r);
  }, []);

  return (
    <>
      <div className="result-table-wrapper" ref={wrapperRef}>
        {error && (
          <div className="result-table__error">{error}</div>
        )}
        <table className="result-table">
          <thead>
            <tr>
              {columns.map(c => <th key={c.key}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <SkeletonRows count={5} columns={columns.length} />
            ) : results.length === 0 ? (
              <tr><td colSpan={columns.length} className="result-table__empty">暂无结果</td></tr>
            ) : (
              results.map(r => (
                <tr key={r.id} onClick={() => handleRowClick(r)} className="result-table__row">
                  {columns.map(c => (
                    <td key={c.key} className={`result-table__cell result-table__cell--${c.key}`}>
                      {c.render(r)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="result-table__pagination">
          <button disabled={page <= 1} onClick={() => onPageChange(page - 1)}>上一页</button>
          <span>第 {page} / {totalPages} 页</span>
          <button disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>下一页</button>
        </div>
      )}

      {selected && (
        <ResultDetail result={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}
