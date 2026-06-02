export default function EmptyState({ onNewTask }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 16, textAlign: 'center' }}>
      <div style={{ fontSize: 48, opacity: 0.3 }}>📡</div>
      <h2 style={{ fontSize: 24, fontWeight: 700 }}>雷达</h2>
      <p style={{ color: 'var(--color-text-muted)', maxWidth: 360, lineHeight: 1.6 }}>
        Web 爬虫与链接探测工具 — 输入目标 URL 或关键词，自动发现并分析外部链接。
      </p>
      <button onClick={onNewTask}
        style={{ marginTop: 8, padding: '12px 32px', background: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 15, cursor: 'pointer' }}>
        开始新任务
      </button>
      <div style={{ marginTop: 24, display: 'flex', gap: 40, fontSize: 13, color: 'var(--color-text-muted)' }}>
        <div><strong style={{ color: 'var(--color-text)' }}>外链探测</strong><br/>输入 URL 自动发现外部链接</div>
        <div><strong style={{ color: 'var(--color-text)' }}>关键词搜索</strong><br/>通过 API 搜索并爬取匹配页</div>
      </div>
    </div>
  );
}
