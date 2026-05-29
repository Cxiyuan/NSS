import { useState, useEffect } from 'react';
import { api } from '../lib/api';

export default function TaskHistory({ onSelect, onDelete }) {
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    api.listTasks(50, 0).then(setTasks).catch(console.error);
  }, []);

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
      <h3>History</h3>
      {tasks.length === 0 ? (
        <p className="task-history__empty">No tasks yet</p>
      ) : (
        <ul className="task-history__list">
          {tasks.map(t => (
            <li key={t.id} className="task-history__item">
              <button className="task-history__item-main" onClick={() => onSelect?.(t)}>
                <span className="task-history__type">{t.type === 'url_crawl' ? 'URL' : 'Keyword'}</span>
                <span className="task-history__config">
                  {t.type === 'url_crawl' ? t.config.url : t.config.keywords}
                </span>
                <span className="task-history__status" style={{ color: statusColors[t.status] }}>
                  {t.status}
                </span>
                <span className="task-history__date">
                  {new Date(t.created_at).toLocaleDateString()}
                </span>
              </button>
              <button
                className="task-history__delete"
                onClick={() => handleDelete(t.id)}
                aria-label="Delete task"
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
