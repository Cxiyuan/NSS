import { useState, useEffect } from 'react';
import { api } from '../lib/api';

export default function TaskHistory({ onSelect, onDelete, refreshKey }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  function loadTasks() {
    setLoading(true);
    setError(null);
    api.listTasks(50, 0)
      .then((data) => {
        setTasks(data || []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || '加载失败');
        setLoading(false);
      });
  }

  useEffect(() => {
    loadTasks();
  }, [refreshKey]);

  function handleDelete(id) {
    api.deleteTask(id).then(() => {
      setTasks(t => t.filter(t => t.id !== id));
      onDelete?.(id);
    }).catch(console.error);
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
        <p className="task-history__empty" style={{ color: 'var(--color-error)' }}>{error}</p>
      ) : tasks.length === 0 ? (
        <p className="task-history__empty">暂无任务</p>
      ) : (
        <ul className="task-history__list">
          {tasks.map(t => (
            <li key={t.id} className="task-history__item">
              <button className="task-history__item-main" onClick={() => onSelect?.(t)}>
                <span className="task-history__type">{t.type === 'url_crawl' ? 'URL爬取' : '关键词'}</span>
                <span className="task-history__config">
                  {t.type === 'url_crawl' ? t.config.url : t.config.keywords}
                </span>
                <span className="task-history__status" style={{ color: statusColors[t.status] }}>
                  {{pending:'等待中',running:'运行中',paused:'已暂停',completed:'已完成',error:'错误',cancelled:'已取消'}[t.status] || t.status}
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
    </div>
  );
}
