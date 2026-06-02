import { useRef, useEffect } from 'react';
import { useWorkspace } from '../../contexts/WorkspaceContext';

const LINK_TYPE_LABELS = {
  a: '超链接', img: '图片', link: '资源引用', iframe: '内嵌框架',
  form: '表单', meta: '页面跳转', script: '脚本', js_dynamic: 'JS动态',
  css: '样式表', comment: '注释', keyword_match: '关键词匹配',
};

function truncate(str, max) {
  if (!str || str.length <= max) return str;
  return str.slice(0, max) + '...';
}

export default function ResultTable({ results, total, page, limit, onPageChange }) {
  const { dispatch } = useWorkspace();
  const wrapperRef = useRef(null);
  const totalPages = Math.ceil(total / limit);

  useEffect(() => {
    if (wrapperRef.current) wrapperRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [page]);

  const columns = [
    { key: 'url', label: 'URL', render: r => <a href={r.url} target="_blank" rel="noreferrer" className="result-table__link">{truncate(r.url, 60)}</a> },
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
      <div className="result-table-wrapper" ref={wrapperRef}>
        <table className="result-table">
          <thead>
            <tr>{columns.map(c => <th key={c.key}>{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {results.length === 0 ? (
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
