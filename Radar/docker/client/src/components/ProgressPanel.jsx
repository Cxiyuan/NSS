export default function ProgressPanel({ status, stats }) {
  const { crawled = 0, total = 0, external = 0, depth = 0 } = stats || {};

  const pct = total > 0 ? Math.round((crawled / total) * 100) : 0;
  const statusLabel = {
    pending: '等待中',
    running: '运行中',
    paused: '已暂停',
    completed: '已完成',
    error: '错误',
    cancelled: '已取消',
  }[status] || status;

  const indicatorClass = {
    running: 'progress-panel__indicator--running',
    paused: 'progress-panel__indicator--paused',
    completed: 'progress-panel__indicator--completed',
  }[status] || '';

  return (
    <div className="progress-panel">
      <div className="progress-panel__header">
        <span className={`progress-panel__indicator ${indicatorClass}`} />
        <span className="progress-panel__status">{statusLabel}</span>
      </div>

      <div className="progress-panel__bar-track">
        <div
          className={`progress-panel__bar-fill ${status === 'running' ? 'progress-panel__bar-fill--animated' : ''}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="progress-panel__stats">
        <Stat label="已爬取" value={`${crawled} / ${total}`} />
        <Stat label="外部链接" value={external} />
        <Stat label="已过滤" value={stats.filtered || 0} />
        <Stat label="深度" value={depth} />
        <Stat label="进度" value={`${pct}%`} />
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="progress-panel__stat">
      <div className="progress-panel__stat-value">{value}</div>
      <div className="progress-panel__stat-label">{label}</div>
    </div>
  );
}
