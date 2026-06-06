// /metrics endpoint — Prometheus text format (no npm install).
// v1.2.QA Sprint 4: lightweight in-memory metrics.
//
// Why not use `prom-client`? It's a 200KB dep with histogram support we
// don't need. A counter + gauge + uptime + per-task stats suffices for
// Grafana scraping. Output format is Prometheus text exposition v0.0.4
// compatible (so any scraper works).
//
// Endpoints:
//   GET /metrics — text/plain; version=0.0.4
//   GET /healthz  — existing
//   GET /readyz   — existing
//
// Exports a singleton `metrics` object so handlers can increment without
// reaching into globals.

class Metrics {
  constructor() {
    this.startedAt = Date.now();
    this.counters = new Map();   // name → value
    this.gauges   = new Map();   // name → value
    this.histograms = new Map(); // name → [sum, count, buckets...]
  }

  // Increment a counter (monotonic). Initialize to 0 if new.
  inc(name, value = 1, labels = {}) {
    const key = this._key(name, labels);
    this.counters.set(key, (this.counters.get(key) || 0) + value);
  }

  // Set a gauge to a specific value (can go up or down).
  gauge(name, value, labels = {}) {
    const key = this._key(name, labels);
    this.gauges.set(key, value);
  }

  // Observe a histogram value (basic — just sum + count for now).
  observe(name, value, labels = {}) {
    const key = this._key(name, labels);
    const h = this.histograms.get(key) || { sum: 0, count: 0 };
    h.sum += value;
    h.count += 1;
    this.histograms.set(key, h);
  }

  // Internal: serialize labels into a key
  _key(name, labels) {
    const labelKeys = Object.keys(labels).sort();
    if (labelKeys.length === 0) return name;
    const labelStr = labelKeys.map(k => `${k}="${labels[k]}"`).join(',');
    return `${name}{${labelStr}}`;
  }

  // Render in Prometheus text format
  // (https://prometheus.io/docs/instrumenting/exposition_formats/)
  render() {
    const lines = [];
    lines.push('# HELP radar_uptime_seconds Process uptime in seconds');
    lines.push('# TYPE radar_uptime_seconds gauge');
    lines.push(`radar_uptime_seconds ${((Date.now() - this.startedAt) / 1000).toFixed(2)}`);
    lines.push('');

    // Counters
    if (this.counters.size > 0) {
      lines.push('# HELP radar_counters Auto-incrementing metrics from the app');
      lines.push('# TYPE radar_counters counter');
      // Group by metric name (strip labels) for HELP line
      const byName = new Map();
      for (const [k, v] of this.counters) {
        const name = k.split('{')[0];
        if (!byName.has(name)) byName.set(name, []);
        byName.get(name).push([k, v]);
      }
      for (const [name, entries] of byName) {
        lines.push(`# HELP ${name} (counter)`);
        lines.push(`# TYPE ${name} counter`);
        for (const [k, v] of entries) {
          lines.push(`${k} ${v}`);
        }
      }
      lines.push('');
    }

    // Gauges
    if (this.gauges.size > 0) {
      const byName = new Map();
      for (const [k, v] of this.gauges) {
        const name = k.split('{')[0];
        if (!byName.has(name)) byName.set(name, []);
        byName.get(name).push([k, v]);
      }
      for (const [name, entries] of byName) {
        lines.push(`# HELP ${name} (gauge)`);
        lines.push(`# TYPE ${name} gauge`);
        for (const [k, v] of entries) {
          lines.push(`${k} ${v}`);
        }
      }
      lines.push('');
    }

    // Histograms
    if (this.histograms.size > 0) {
      const byName = new Map();
      for (const [k, h] of this.histograms) {
        const name = k.split('{')[0];
        if (!byName.has(name)) byName.set(name, []);
        byName.get(name).push([k, h]);
      }
      for (const [name, entries] of byName) {
        lines.push(`# HELP ${name} (histogram, sum + count)`);
        lines.push(`# TYPE ${name} summary`);
        for (const [k, h] of entries) {
          lines.push(`${k}_sum ${h.sum.toFixed(3)}`);
          lines.push(`${k}_count ${h.count}`);
        }
      }
    }

    return lines.join('\n') + '\n';
  }

  // Test helper
  reset() {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.startedAt = Date.now();
  }
}

// Singleton — import in any module, share the same instance.
export const metrics = new Metrics();

// Also export the class for tests that need an isolated instance
// (avoid singleton state pollution across tests).
export { Metrics };
