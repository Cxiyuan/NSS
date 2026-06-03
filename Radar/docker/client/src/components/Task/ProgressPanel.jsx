import './ProgressPanel.css';

export default function ProgressPanel({ status, stats, visibleTotal }) {
  const { crawled = 0, total = 0, depth = 0, filtered = 0, visited = 0 } = stats || {};
  const displayTotal = visibleTotal !== undefined ? visibleTotal : total;

  // Use visited (total unique URLs discovered) as progress denominator — never exceeds 100%
  const denominator = visited || total || 1;
  const pct = Math.min(Math.round((crawled / denominator) * 100), 100);

  const statusLabel = {
    pending: '等待中', running: '运行中', paused: '已暂停',
    completed: '已完成', error: '错误', cancelled: '已取消',
  }[status] || status;

  const indicatorClass = {
    running: 'pp-indicator--running',
    paused: 'pp-indicator--paused',
    completed: 'pp-indicator--completed',
  }[status] || '';

  // Only show visited/total breakdown when both are meaningful
  const showBreakdown = visited > 0 || total > 0;

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
        {showBreakdown && (
          <>
            <Stat label="爬取页面" value={crawled} />
            <Stat label="发现结果" value={displayTotal} />
            {displayTotal !== total && (
              <Stat label="已过滤域名" value={total - displayTotal} />
            )}
            <Stat label="待爬队列" value={Math.max(0, visited - crawled)} />
          </>
        )}
        <Stat label="已过滤" value={filtered} />
        {depth > 0 && <Stat label="当前深度" value={depth} />}
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
