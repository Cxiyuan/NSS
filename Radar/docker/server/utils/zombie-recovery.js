// Zombie task recovery — v1.2 fix: 9.2.11 (extracted from index.js for testability).
// On server restart, any task left in 'running' or 'paused' status is stale
// (its worker thread is gone). We mark it 'error' + record a human-readable
// reason in the task config for the UI to display.
export function recoverZombieTasks(db, queries) {
  const zombieTasks = db.prepare(
    "SELECT id, status FROM tasks WHERE status IN ('running','paused')"
  ).all();
  for (const t of zombieTasks) {
    console.warn(`Recovering zombie task ${t.id} (${t.status} → error)`);
    queries.updateTaskStatus(t.id, 'error');
    const task = queries.getTask(t.id);
    if (task) {
      task.config = { ...task.config, error_message: 'Server restarted while task was running — worker lost' };
      queries.updateTaskConfig(t.id, task.config);
    }
  }
  return zombieTasks.length;
}
