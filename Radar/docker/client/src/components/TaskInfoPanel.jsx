import { useState, useEffect } from 'react';

function elapsed(startTime) {
  if (!startTime) return '';
  const diff = Date.now() - new Date(startTime).getTime();
  const s = Math.floor(diff / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export default function TaskInfoPanel({ taskConfig, startTime }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!taskConfig) return null;

  return (
    <div className="task-info-panel">
      <div className="task-info-panel__header">当前任务</div>
      <div className="task-info-panel__body">
        <div className="task-info-panel__row">
          <span className="task-info-panel__label">目标地址</span>
          <span className="task-info-panel__value task-info-panel__value--url">{taskConfig.url}</span>
        </div>
        <div className="task-info-panel__row">
          <span className="task-info-panel__label">探测深度</span>
          <span className="task-info-panel__value">{taskConfig.depth}</span>
          <span className="task-info-panel__label" style={{ marginLeft: 24 }}>并发数</span>
          <span className="task-info-panel__value">{taskConfig.concurrency}</span>
        </div>
        {taskConfig.filters && taskConfig.filters.length > 0 && (
          <div className="task-info-panel__row">
            <span className="task-info-panel__label">过滤条件</span>
            <span className="task-info-panel__value">
              {taskConfig.filters.map(f => (
                <span key={f} className="task-info-panel__tag">{f}</span>
              ))}
            </span>
          </div>
        )}
        <div className="task-info-panel__row">
          <span className="task-info-panel__label">运行时长</span>
          <span className="task-info-panel__value task-info-panel__value--time">{elapsed(startTime)}</span>
        </div>
      </div>
    </div>
  );
}