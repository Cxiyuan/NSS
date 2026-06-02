import { useState, useRef, useEffect } from 'react';
import { LINK_TYPE_LABELS } from '../lib/constants';
import { truncate } from '../lib/utils';

export default function ResultTable({ results, total, page, limit, onPageChange, onRowClick, error, loading }) {
  const totalPages = Math.ceil(total / limit);
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (wrapperRef.current) wrapperRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [page]);

  const columns = [
    { key: 'url', label: 'URL', render: r => <a href={r.url} target="_blank" rel="noreferrer" className="result-table__link">{truncate(r.url, 60)}</a> },
    { key: 'page_title', label: '标题/状态', render: r => (
      <span className={'result-table__title' + (!r.page_title && r.status_code ? ' result-table__title--error' : '')}>
        {r.page_title || (r.status_code ? `HTTP ${r.status_code}` : '—')}
      </span>
    )},
    { key: 'found_on', label: '来源', render: r => truncate(r.found_on, 40) },
    { key: 'link_type', label: '类型', render: r => <span className={'link-type link-type--' + r.link_type}>{LINK_TYPE_LABELS[r.link_type] || r.link_type}</span> },
    { key: 'depth', label: '深度', render: r => r.depth },
  ];

  if (error) {
    return <div style={{ padding: 16, marginTop: 8, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#991b1b', fontSize: 13 }}>⚠ 加载失败: {error}</div>;
  }

  return (
    <>
      <div className="result-table-wrapper" ref={wrapperRef}>
        <table className="result-table">
          <thead><tr>{columns.map(c => <th key={c.key}>{c.label}</th>)}</tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5}>
                {[1,2,3,4,5].map(i => <div key={i} className="skeleton skeleton--row" style={{ width: 60 + i * 10 + '%' }} />)}
              </td></tr>
            ) : results.length === 0 ? (
              <tr><td colSpan={5} className="result-table__empty">暂无结果</td></tr>
            ) : (
              results.map(r => (
                <tr key={r.id || r._key} onClick={() => onRowClick?.(r)} className="result-table__row" style={{ cursor: onRowClick ? 'pointer' : 'default' }}>
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
