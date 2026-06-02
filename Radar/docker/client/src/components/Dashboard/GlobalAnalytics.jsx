import KpiCard from './KpiCard';

export default function GlobalAnalytics() {
  return (
    <div>
      <h3 style={{ fontSize: 15, marginBottom: 12, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>全局概览</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        <KpiCard label="运行中任务" value="0" subtitle="暂无活跃任务" color="#3b82f6" />
        <KpiCard label="今日爬取" value="0" subtitle="总计页面数" color="#10b981" />
        <KpiCard label="错误率" value="0%" subtitle="过去 24 小时" color="#6b7280" />
        <KpiCard label="完成率" value="0%" subtitle="全部任务" color="#8b5cf6" />
      </div>
      <div style={{ textAlign: 'center', padding: 60, color: 'var(--color-text-muted)', fontSize: 13, border: '2px dashed var(--color-border)', borderRadius: 'var(--radius)' }}>
        创建并运行任务后，此处将显示聚合图表和分析数据
      </div>
    </div>
  );
}
