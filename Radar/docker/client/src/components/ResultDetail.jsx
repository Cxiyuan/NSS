import { useRef, useEffect } from 'react';
import { LINK_TYPE_LABELS } from '../lib/constants';

export default function ResultDetail({ result, onClose }) {
  const closeRef = useRef(null);

  // Escape keydown -> onClose
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Auto-focus the close button on mount
  useEffect(() => {
    if (closeRef.current) closeRef.current.focus();
  }, []);

  // Body scroll lock while dialog is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  if (!result) return null;

  return (
    <div
      className="result-detail-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="链接详情"
    >
      <div className="result-detail" onClick={e => e.stopPropagation()}>
        <div className="result-detail__header">
          <h3>链接详情</h3>
          <button ref={closeRef} onClick={onClose} className="result-detail__close">&times;</button>
        </div>

        <dl className="result-detail__fields">
          <dt>URL</dt>
          <dd><a href={result.url} target="_blank" rel="noreferrer">{result.url}</a></dd>

          <dt>来源页面</dt>
          <dd>{result.found_on}</dd>

          <dt>链接类型</dt>
          <dd><span className={`link-type link-type--${result.link_type}`}>{LINK_TYPE_LABELS[result.link_type] || result.link_type}</span></dd>

          <dt>深度</dt>
          <dd>{result.depth}</dd>

          <dt>状态</dt>
          <dd>{result.status_code ? `HTTP ${result.status_code}` : '—'}</dd>

          {result.page_title && (
            <>
              <dt>页面标题</dt>
              <dd>{result.page_title}</dd>
            </>
          )}

          {result.snippet && (
            <>
              <dt>摘要</dt>
              <dd className="result-detail__snippet">{result.snippet}</dd>
            </>
          )}
        </dl>
      </div>
    </div>
  );
}
