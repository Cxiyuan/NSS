const LINK_TYPE_LABELS = {
  a: '超链接', img: '图片', link: '资源引用', iframe: '内嵌框架',
  form: '表单', meta: '页面跳转', script: '脚本', js_dynamic: 'JS动态',
  css: '样式表', comment: '注释', keyword_match: '关键词匹配',
};

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
          <dd><span className={`link-type link-type--${result.link_type}`}>{LINK_TYPE_LABELS[result.link_type] || result.link_type}</span></dd>

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
