import { useMemo } from 'react';

/**
 * Formats a date string into a relative Chinese timestamp.
 * Examples: "刚刚", "3分钟前", "2小时前", "5天前"
 */
function getRelativeTime(dateStr) {
  if (!dateStr) return '';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}天前`;
  if (hours > 0) return `${hours}小时前`;
  if (minutes > 0) return `${minutes}分钟前`;
  return '刚刚';
}

/**
 * Returns the display label for a task (URL or keywords).
 */
function getLabel(task) {
  if (task.type === 'url_crawl') return task.config?.url || '(no URL)';
  return task.config?.keywords || '(no keywords)';
}

/**
 * Returns the type icon character based on task type.
 */
function getTypeIcon(task) {
  return task.type === 'url_crawl' ? '🔗' : '🔍';
}

/**
 * Calculates progress percentage from task stats.
 * Handles both `crawled/total` (WS shape) and `scanned/total` (API shape).
 */
function getProgress(task) {
  if (!task.stats) return 0;
  const { total = 0 } = task.stats;
  if (total <= 0) return 0;
  const done = task.stats.crawled ?? task.stats.scanned ?? 0;
  return Math.min(100, Math.round((done / total) * 100));
}

/**
 * Maps API status values to display status keys.
 * `failed` from the API is normalized to `error`.
 */
const STATUS = {
  failed: 'error',
};
function normalizeStatus(status) {
  return STATUS[status] || status;
}

export default function TaskItem({ task, isActive, onSelect, onRetry, onDelete }) {
  const status = useMemo(() => normalizeStatus(task.status), [task.status]);
  const label = useMemo(() => getLabel(task), [task]);
  const timestamp = useMemo(() => getRelativeTime(task.created_at), [task.created_at]);
  const icon = useMemo(() => getTypeIcon(task), [task]);
  const progress = useMemo(() => getProgress(task), [task]);

  const showDelete = (status === 'completed' || status === 'cancelled') && onDelete;

  return (
    <div
      className={`task-item${isActive ? ' task-item--active' : ''}`}
      onClick={() => onSelect?.(task)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect?.(task); }}
    >
      <span className={`task-item__dot task-item__dot--${status}`} />

      <span className="task-item__icon">{icon}</span>

      <span className="task-item__label" title={label}>
        {label}
      </span>

      <span className="task-item__meta">
        {status === 'error' && onRetry && (
          <button
            className="task-item__retry-btn"
            onClick={(e) => {
              e.stopPropagation();
              onRetry(task);
            }}
            title="重试"
            aria-label={`重试任务 ${task.id}`}
          >
            &#x21bb;
          </button>
        )}
        {showDelete && (
          <button
            className="task-item__retry-btn"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(task.id);
            }}
            title="删除"
            aria-label={`删除任务 ${task.id}`}
          >
            &#x2715;
          </button>
        )}
        {status === 'running' && progress > 0 && (
          <span className="task-item__progress">
            <span className="task-item__progress-track">
              <span
                className="task-item__progress-fill"
                style={{ width: `${progress}%` }}
              />
            </span>
          </span>
        )}
      </span>

      <span className="task-item__timestamp">{timestamp}</span>
    </div>
  );
}
