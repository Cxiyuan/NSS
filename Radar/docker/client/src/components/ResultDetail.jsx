export default function ResultDetail({ result, onClose }) {
  if (!result) return null;

  return (
    <div className="result-detail-overlay" onClick={onClose}>
      <div className="result-detail" onClick={e => e.stopPropagation()}>
        <div className="result-detail__header">
          <h3>Link Detail</h3>
          <button onClick={onClose} className="result-detail__close">&times;</button>
        </div>

        <dl className="result-detail__fields">
          <dt>URL</dt>
          <dd><a href={result.url} target="_blank" rel="noreferrer">{result.url}</a></dd>

          <dt>Found On</dt>
          <dd>{result.found_on}</dd>

          <dt>Link Type</dt>
          <dd>{result.link_type}</dd>

          <dt>Depth</dt>
          <dd>{result.depth}</dd>

          {result.page_title && (
            <>
              <dt>Page Title</dt>
              <dd>{result.page_title}</dd>
            </>
          )}

          {result.snippet && (
            <>
              <dt>Snippet</dt>
              <dd className="result-detail__snippet">{result.snippet}</dd>
            </>
          )}
        </dl>
      </div>
    </div>
  );
}
