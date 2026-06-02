import { useState, useMemo, useCallback } from 'react';
import TaskItem from './TaskItem';

/**
 * Status group definitions.
 * Order defines the display order.
 */
const GROUPS = [
  { status: 'running',    icon: '▶', label: '运行中' },  // ▶
  { status: 'paused',     icon: '⏸', label: '已暂停' },  // ⏸
  { status: 'error',      icon: '✕', label: '错误' },    // ✕
  { status: 'pending',    icon: '○', label: '待定' },    // ○
  { status: 'completed',  icon: '✓', label: '已完成' },  // ✓
  { status: 'cancelled',  icon: '◇', label: '已取消' },  // ◇
];

/** Maps API `failed` to the `error` group. */
const STATUS_ALIAS = { failed: 'error' };

/**
 * Normalizes a task status to one of the known GROUPS statuses.
 */
function normalizeStatus(raw) {
  return STATUS_ALIAS[raw] || raw;
}

/**
 * Groups a list of tasks by their normalized status.
 * Returns a Map<status, task[]> in display order.
 */
function groupTasks(tasks) {
  const map = new Map();
  for (const status of GROUPS.map(g => g.status)) {
    map.set(status, []);
  }
  for (const task of tasks) {
    const s = normalizeStatus(task.status);
    if (map.has(s)) {
      map.get(s).push(task);
    }
  }
  return map;
}

export default function TaskGroupList({ tasks = [], activeTaskId, onSelect, onRetry }) {
  // Collapse state: keyed by status string
  const [collapsed, setCollapsed] = useState(() => new Set());

  const grouped = useMemo(() => groupTasks(tasks), [tasks]);

  const toggleGroup = useCallback((status) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  }, []);

  return (
    <div className="task-group-list">
      {GROUPS.map(({ status, icon, label }) => {
        const groupTasks = grouped.get(status);
        const count = groupTasks?.length || 0;
        if (count === 0) return null; // hide empty groups

        const isCollapsed = collapsed.has(status);

        return (
          <div
            key={status}
            className={`task-group${isCollapsed ? ' task-group--collapsed' : ''}`}
          >
            {/* Group header — click to toggle */}
            <div
              className="task-group__header"
              onClick={() => toggleGroup(status)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleGroup(status); }}
            >
              <span className="task-group__header-icon">{icon}</span>
              <span className="task-group__header-label">{label}</span>
              <span className="task-group__header-count">{count}</span>
            </div>

            {/* Group body — hidden when collapsed */}
            <div className="task-group__body">
              {groupTasks.map((task) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  isActive={task.id === activeTaskId}
                  onSelect={onSelect}
                  onRetry={onRetry}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
