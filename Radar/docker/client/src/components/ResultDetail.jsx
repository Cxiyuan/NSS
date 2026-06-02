import { LINK_TYPE_LABELS } from '../lib/constants';

export default function ResultDetail({ result }) {
  if (!result) return null;

  return (
    <div>
      <dl style={{ margin: 0 }}>
        <Row dt="URL" dd={<a href={result.url} target="_blank" rel="noreferrer" style={{ color: 'var(--color-primary)', wordBreak: 'break-all' }}>{result.url}</a>} />
        <Row dt="来源页面" dd={result.found_on || '—'} />
        <Row dt="链接类型" dd={<span style={{ padding: '1px 6px', borderRadius: 3, fontSize: 11, background: '#f1f5f9' }}>{LINK_TYPE_LABELS[result.link_type] || result.link_type}</span>} />
        <Row dt="深度" dd={result.depth ?? '—'} />
        <Row dt="状态" dd={result.status_code ? `HTTP ${result.status_code}` : '—'} />
        {result.page_title && <Row dt="页面标题" dd={result.page_title} />}
        {result.snippet && <Row dt="摘要" dd={<div style={{ fontSize: 12, color: 'var(--color-text-muted)', background: '#f8fafc', padding: 8, borderRadius: 4, maxHeight: 120, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{result.snippet}</div>} />}
      </dl>
    </div>
  );
}

function Row({ dt, dd }) {
  return (
    <>
      <dt style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--color-text-muted)', marginTop: 12, marginBottom: 2 }}>{dt}</dt>
      <dd style={{ fontSize: 13, margin: 0, wordBreak: 'break-all' }}>{dd}</dd>
    </>
  );
}
