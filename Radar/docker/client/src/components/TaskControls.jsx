import { api } from '../lib/api';

export default function TaskControls({ task, onStatusChange, onExport }) {
  if (!task) return null;

  async function handlePause() {
    try {
      await api.pauseTask(task.id);
      onStatusChange?.('paused');
    } catch (e) {
      console.error(e);
    }
  }

  async function handleResume() {
    try {
      await api.resumeTask(task.id);
      onStatusChange?.('running');
    } catch (e) {
      console.error(e);
    }
  }

  async function handleCancel() {
    try {
      await api.cancelTask(task.id);
      onStatusChange?.('cancelled');
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <div className="task-controls">
      {task.status === 'running' && (
        <button className="btn" onClick={handlePause}>
          暂停
        </button>
      )}
      {task.status === 'paused' && (
        <button className="btn" onClick={handleResume}>
          恢复
        </button>
      )}
      {['running', 'paused'].includes(task.status) && (
        <button className="btn btn--danger" onClick={handleCancel}>
          取消
        </button>
      )}
      {task.status === 'completed' && (
        <button className="btn" onClick={() => onExport?.(task.id)}>
          导出
        </button>
      )}
    </div>
  );
}
