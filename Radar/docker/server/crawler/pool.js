import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class WorkerPool {
  #workers = new Map();
  #maxWorkers;
  #onMessage;

  constructor(maxWorkers = 3, onMessage) {
    this.#maxWorkers = maxWorkers;
    this.#onMessage = onMessage;
  }

  startTask(taskId, config) {
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
    });

    worker.on('exit', (code) => {
      this.#workers.delete(taskId);
    });

    worker.postMessage({ type: 'start', config });
    return worker;
  }

  pauseTask(taskId) {
    const worker = this.#workers.get(taskId);
    if (worker) worker.postMessage({ type: 'pause' });
  }

  resumeTask(taskId) {
    const worker = this.#workers.get(taskId);
    if (worker) worker.postMessage({ type: 'resume' });
  }

  cancelTask(taskId) {
    const worker = this.#workers.get(taskId);
    if (worker) {
      worker.postMessage({ type: 'cancel' });
      setTimeout(() => {
        if (this.#workers.has(taskId)) {
          worker.terminate();
          this.#workers.delete(taskId);
        }
      }, 5000);
    }
  }

  isTaskRunning(taskId) {
    return this.#workers.has(taskId);
  }

  get activeWorkers() {
    return this.#workers.size;
  }
}
