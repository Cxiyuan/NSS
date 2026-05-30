export default function ResultDetail({ result, onClose }) {
  if (!result) return null;

  return (
    <div className="result-detail-overlay" onClick={onClose}>
      <div className="result-detail" onClick={e => e.stopPropagation()}>
        <div className="result-detail__header">
          <h3>链接详情</h3>
          <button onClick={onClose} className="result-detail__close">&times;</button>
        </div>

        <dl className="result-detail__fields">
          <dt>URL</dt>
          <dd><a href={result.url} target="_blank" rel="noreferrer">{result.url}</a></dd>

          <dt>来源页面</dt>
          <dd>{result.found_on}</dd>

          <dt>链接类型</dt>
          <dd>{result.link_type}</dd>

          <dt>深度</dt>
          <dd>{result.depth}</dd>

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
