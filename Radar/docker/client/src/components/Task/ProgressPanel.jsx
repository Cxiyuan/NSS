import './ProgressPanel.css';

export default function ProgressPanel({ status, stats }) {
  const { crawled = 0, total = 0, depth = 0, filtered = 0 } = stats || {};

  const pct = total > 0 ? Math.round((crawled / total) * 100) : 0;
  const statusLabel = {
    pending: '等待中', running: '运行中', paused: '已暂停',
    completed: '已完成', error: '错误', cancelled: '已取消',
  }[status] || status;

  const indicatorClass = {
    running: 'pp-indicator--running',
    paused: 'pp-indicator--paused',
    completed: 'pp-indicator--completed',
  }[status] || '';

  return (
    <div className="pp">
      <div className="pp__header">
        <span className={`pp__indicator ${indicatorClass}`} />
        <span className="pp__status">{statusLabel}</span>
      </div>
      <div className="pp__bar-track">
        <div className={`pp__bar-fill ${status === 'running' ? 'pp__bar-fill--animated' : ''}`}
          style={{ width: `${pct}%` }} />
      </div>
      <div className="pp__stats">
        <Stat label="已爬取" value={`${crawled} / ${total}`} />
        <Stat label="已过滤" value={filtered} />
        <Stat label="深度" value={depth} />
        <Stat label="进度" value={`${pct}%`} />
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="pp__stat">
      <div className="pp__stat-value">{value}</div>
      <div className="pp__stat-label">{label}</div>
    </div>
  );
}
