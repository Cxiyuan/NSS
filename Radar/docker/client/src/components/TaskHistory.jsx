import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import useConfirm from '../hooks/useConfirm';

export default function TaskHistory({ onSelect, onDelete, refreshKey }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);
  const { confirm, ConfirmDialog } = useConfirm();

  function loadTasks() {
    setLoading(true);
    setError(null);
    api.listTasks(50, 0)
      .then((data) => {
        if (!mountedRef.current) return;
        setTasks(data || []);
        setLoading(false);
      })
      .catch((err) => {
        if (!mountedRef.current) return;
        setError(err.message || '加载失败');
        setLoading(false);
      });
  }

  useEffect(() => {
    mountedRef.current = true;
    loadTasks();
    return () => {
      mountedRef.current = false;
    };
  }, [refreshKey]);

  // Poll every 10s if any task is non-terminal
  useEffect(() => {
    const hasNonTerminal = tasks.some(t =>
      ['pending', 'running', 'paused'].includes(t.status),
    );
    if (!hasNonTerminal) return;
    const id = setInterval(() => {
      api.listTasks(50, 0)
        .then((data) => {
          if (mountedRef.current) setTasks(data || []);
        })
        .catch(() => {});
    }, 10000);
    return () => clearInterval(id);
  }, [tasks]);

  async function handleDelete(id) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    if (task.status === 'running' || task.status === 'paused') {
      const msg =
        task.status === 'running'
          ? '任务正在运行中，删除前将取消该任务。是否继续？'
          : '任务已暂停，删除前将取消该任务。是否继续？';
      const confirmed = await confirm(msg);
      if (!confirmed) return;
      try {
        await api.cancelTask(id);
      } catch (e) {
        // proceed to delete anyway
      }
    }

    api
      .deleteTask(id)
      .then(() => {
        setTasks(t => t.filter(t => t.id !== id));
        onDelete?.(id);
      })
      .catch(console.error);
  }

  const statusColors = {
    completed: 'var(--color-success)',
    running: 'var(--color-primary)',
    paused: 'var(--color-warning)',
    error: 'var(--color-error)',
    cancelled: 'var(--color-muted)',
  };

  return (
    <div className="task-history">
      <h3>历史任务</h3>
      {loading ? (
        <p className="task-history__empty">加载中...</p>
      ) : error ? (
        <p className="task-history__empty" style={{ color: 'var(--color-error)' }}>
          {error}
        </p>
      ) : tasks.length === 0 ? (
        <p className="task-history__empty">暂无任务</p>
      ) : (
        <ul className="task-history__list">
          {tasks.map(t => (
            <li key={t.id} className="task-history__item">
              <button
                className="task-history__item-main"
                onClick={() => onSelect?.(t)}
              >
                <span className="task-history__type">
                  {t.type === 'url_crawl' ? 'URL爬取' : '关键词'}
                </span>
                <span className="task-history__config">
                  {t.type === 'url_crawl' ? t.config.url : t.config.keywords}
                </span>
                <span
                  className="task-history__status"
                  style={{ color: statusColors[t.status] }}
                >
                  {{
                    pending: '等待中',
                    running: '运行中',
                    paused: '已暂停',
                    completed: '已完成',
                    error: '错误',
                    cancelled: '已取消',
                  }[t.status] || t.status}
                </span>
                <span className="task-history__date">
                  {new Date(t.created_at).toLocaleDateString()}
                </span>
              </button>
              <button
                className="task-history__delete"
                onClick={() => handleDelete(t.id)}
                aria-label="删除任务"
              >
                &times;
              </button>
            </li>
          ))}
        </ul>
      )}
      {ConfirmDialog}
    </div>
  );
}
