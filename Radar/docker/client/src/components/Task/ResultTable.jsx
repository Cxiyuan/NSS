import { useRef, useEffect } from 'react';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { LINK_TYPE_LABELS } from '../../lib/constants';

function truncate(str, max) {
  if (!str || str.length <= max) return str;
  return str.slice(0, max) + '...';
}

function SkeletonRow({ columns }) {
  return (
    <tr className="result-table__row result-table__row--skeleton">
      {columns.map((c, i) => (
        <td key={c.key}>
          <div className="skeleton" style={{ width: i === 0 ? '70%' : i === 1 ? '40%' : '30%', height: 14, borderRadius: 4, background: 'var(--color-border)', opacity: 0.5, animation: 'shimmer 1.5s infinite' }} />
        </td>
      ))}
    </tr>
  );
}

export default function ResultTable({ results = [], total = 0, page = 1, limit = 50, onPageChange, error, loading }) {
  const { dispatch } = useWorkspace();
  const wrapperRef = useRef(null);
  const totalPages = Math.ceil(total / limit);

  useEffect(() => {
    if (wrapperRef.current) wrapperRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [page]);

  const columns = [
    { key: 'url', label: 'URL', render: r => <a href={r.url} target="_blank" rel="noreferrer" className="result-table__link" onClick={e => e.stopPropagation()}>{truncate(r.url, 60)}</a> },
    { key: 'page_title', label: '标题/状态', render: r => (
      <span className={`result-table__title ${!r.page_title && r.status_code ? 'result-table__title--error' : ''}`}>
        {r.page_title || (r.status_code ? `HTTP ${r.status_code}` : '—')}
      </span>
    )},
    { key: 'found_on', label: '来源页面', render: r => truncate(r.found_on, 40) },
    { key: 'link_type', label: '类型', render: r => <span className={`link-type link-type--${r.link_type}`}>{LINK_TYPE_LABELS[r.link_type] || r.link_type}</span> },
    { key: 'depth', label: '深度', render: r => r.depth },
  ];

  return (
    <>
      {error && (
        <div className="result-table__error" style={{ padding: '8px 12px', marginBottom: 8, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius)', color: '#b91c1c', fontSize: 13 }}>
          {error}
        </div>
      )}
      <div className="result-table-wrapper" ref={wrapperRef}>
        <table className="result-table">
          <thead>
            <tr>{columns.map(c => <th key={c.key}>{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {loading ? (
              <>
                <SkeletonRow columns={columns} />
                <SkeletonRow columns={columns} />
                <SkeletonRow columns={columns} />
                <SkeletonRow columns={columns} />
                <SkeletonRow columns={columns} />
              </>
            ) : results.length === 0 ? (
              <tr><td colSpan={columns.length} className="result-table__empty">暂无结果</td></tr>
            ) : (
              results.map(r => (
                <tr key={r.id} onClick={() => dispatch({ type: 'OPEN_RIGHT_PANEL', payload: { type: 'result', data: r } })} className="result-table__row">
                  {columns.map(c => <td key={c.key}>{c.render(r)}</td>)}
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
    </>
  );
}
