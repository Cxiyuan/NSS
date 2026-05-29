export default function ProgressPanel({ status, stats }) {
  const { crawled = 0, total = 0, external = 0, depth = 0 } = stats || {};

  const pct = total > 0 ? Math.round((crawled / total) * 100) : 0;
  const statusLabel = {
    pending: 'Pending',
    running: 'Running',
    paused: 'Paused',
    completed: 'Completed',
    error: 'Error',
    cancelled: 'Cancelled',
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
        <Stat label="Crawled" value={`${crawled} / ${total}`} />
        <Stat label="External Links" value={external} />
        <Stat label="Depth" value={depth} />
        <Stat label="Progress" value={`${pct}%`} />
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
