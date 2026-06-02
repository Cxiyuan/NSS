import { LINK_TYPE_LABELS } from '../lib/constants';

export default function ResultDetail({ result }) {
  if (!result) return null;

  return (
    <div>
      <dl style={{ margin: 0 }}>
        <Row dt="URL" dd={<a href={result.url} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all' }}>{result.url}</a>} />
        <Row dt="来源页面" dd={result.found_on || '—'} />
        <Row dt="链接类型" dd={<span className="detail-tag">{LINK_TYPE_LABELS[result.link_type] || result.link_type}</span>} />
        <Row dt="深度" dd={result.depth ?? '—'} />
        <Row dt="状态" dd={result.status_code ? `HTTP ${result.status_code}` : '—'} />
        {result.page_title && <Row dt="页面标题" dd={result.page_title} />}
        {result.snippet && <Row dt="摘要" dd={<div className="detail-snippet">{result.snippet}</div>} />}
      </dl>
    </div>
  );
}

function Row({ dt, dd }) {
  return (
    <>
      <dt className="detail-row__dt">{dt}</dt>
      <dd className="detail-row__dd">{dd}</dd>
    </>
  );
}
