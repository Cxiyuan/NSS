// CrawlQueue — pure-logic URL queue with dedup + depth tracking.
// v1.2.QA Sprint 1 — extracted from worker.js for testability + single
// responsibility.
//
// Tracks:
//   - visited URLs (Set, never re-queued)
//   - pending queue (FIFO, drained in batches)
//   - cancellation flag (stops draining)
//
// Thread-safety: NOT thread-safe — designed for single-threaded worker
// threads. The parentPort message loop in worker.js must coordinate
// cancel() calls.

export class CrawlQueue {
  constructor() {
    this.visited = new Set();
    this.queue = [];
    this.cancelled = false;
  }

  // Add a URL to the queue. Returns true if added, false if duplicate
  // or invalid (e.g. undefined input). Increments size on success.
  enqueue(url, depth, foundOn = '') {
    if (this.cancelled) return false;
    if (!url || typeof url !== 'string') return false;
    if (this.visited.has(url)) return false;
    this.visited.add(url);
    this.queue.push({ url, depth, foundOn });
    return true;
  }

  // Check if URL is already visited.
  has(url) {
    return this.visited.has(url);
  }

  // Drain up to `count` items from the front of the queue.
  // Returns an array of {url, depth, foundOn}.
  // Respects cancellation: returns [] if cancelled.
  take(count) {
    if (this.cancelled) return [];
    const batch = [];
    for (let i = 0; i < count && this.queue.length > 0; i++) {
      batch.push(this.queue.shift());
    }
    return batch;
  }

  // Cancel further draining. Already-enqueued items remain in the queue
  // but take() will return [] until the queue is manually cleared.
  cancel() {
    this.cancelled = true;
  }

  // Reset for a new task (clears visited + queue + cancel flag).
  reset() {
    this.visited.clear();
    this.queue.length = 0;
    this.cancelled = false;
  }

  get size() {
    return this.queue.length;
  }

  get visitedCount() {
    return this.visited.size;
  }

  get isCancelled() {
    return this.cancelled;
  }
}
