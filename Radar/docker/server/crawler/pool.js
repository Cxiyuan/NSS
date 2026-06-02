import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class WorkerPool {
  #workers = new Map();
  #paused = new Set();
  #maxWorkers;
  #onMessage;

  constructor(maxWorkers = 3, onMessage) {
    this.#maxWorkers = maxWorkers;
    this.#onMessage = onMessage;
  }

  startTask(taskId, config) {
    // Respect maxWorkers cap — paused workers don't count towards limit
    const activeCount = this.#workers.size - this.#paused.size;
    if (activeCount >= this.#maxWorkers) {
      return null;
    }

    const worker = new Worker(join(__dirname, 'worker.js'));
    this.#workers.set(taskId, worker);

    worker.on('message', (msg) => {
      if (this.#onMessage) this.#onMessage(taskId, msg);
    });

    worker.on('error', (err) => {
      if (this.#onMessage) {
        this.#onMessage(taskId, { type: 'log', level: 'error', message: err.message });
        this.#onMessage(taskId, { type: 'status', status: 'error' });
      }
      this.#workers.delete(taskId);
      this.#paused.delete(taskId);
    });

    worker.on('exit', (code) => {
      this.#workers.delete(taskId);
      this.#paused.delete(taskId);
    });

    worker.postMessage({ type: 'start', config });
    return worker; // non-null = success
  }

  pauseTask(taskId) {
    const worker = this.#workers.get(taskId);
    if (worker) {
      this.#paused.add(taskId);
      worker.postMessage({ type: 'pause' });
    }
  }

  resumeTask(taskId) {
    const worker = this.#workers.get(taskId);
    if (worker) {
      this.#paused.delete(taskId);
      worker.postMessage({ type: 'resume' });
    }
  }

  sendMessage(taskId, msg) {
    const worker = this.#workers.get(taskId);
    if (worker) worker.postMessage(msg);
  }

  cancelTask(taskId) {
    const worker = this.#workers.get(taskId);
    if (worker) {
      this.#paused.delete(taskId);
      worker.postMessage({ type: 'cancel' });
      setTimeout(() => {
        if (this.#workers.has(taskId)) {
          worker.terminate();
          this.#workers.delete(taskId);
          this.#paused.delete(taskId);
        }
      }, 5000);
    }
  }

  isTaskRunning(taskId) {
    return this.#workers.has(taskId);
  }

  get activeWorkers() {
    return this.#workers.size - this.#paused.size;
  }
}
