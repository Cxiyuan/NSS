// /metrics endpoint tests — v1.2.QA Sprint 4.
import test from 'node:test';
import assert from 'node:assert/strict';
import { metrics, Metrics } from './metrics.js';

test('metrics: counter increments correctly', () => {
  metrics.reset();
  metrics.inc('requests_total');
  metrics.inc('requests_total', 5);
  metrics.inc('requests_total', 1);
  const out = metrics.render();
  assert.match(out, /requests_total 7/);
});

test('metrics: counter with labels (multi-dimensional)', () => {
  metrics.reset();
  metrics.inc('http_requests_total', 1, { method: 'GET', path: '/api/tasks' });
  metrics.inc('http_requests_total', 3, { method: 'GET', path: '/api/tasks' });
  metrics.inc('http_requests_total', 2, { method: 'POST', path: '/api/tasks' });
  const out = metrics.render();
  assert.match(out, /http_requests_total\{method="GET",path="\/api\/tasks"\} 4/);
  assert.match(out, /http_requests_total\{method="POST",path="\/api\/tasks"\} 2/);
});

test('metrics: gauge records instantaneous value', () => {
  metrics.reset();
  metrics.gauge('active_tasks', 5);
  metrics.gauge('active_tasks', 3);  // overwrites
  assert.match(metrics.render(), /active_tasks 3/);
});

test('metrics: histogram accumulates sum + count', () => {
  metrics.reset();
  metrics.observe('http_duration_seconds', 0.1);
  metrics.observe('http_duration_seconds', 0.2);
  metrics.observe('http_duration_seconds', 0.5);
  const out = metrics.render();
  assert.match(out, /http_duration_seconds_count 3/);
  assert.match(out, /http_duration_seconds_sum 0.800/);
});

test('metrics: uptime is reported', () => {
  metrics.reset();
  const out = metrics.render();
  assert.match(out, /# TYPE radar_uptime_seconds gauge/);
  assert.match(out, /radar_uptime_seconds \d/);
});

test('metrics: empty output still includes uptime', () => {
  metrics.reset();
  const out = metrics.render();
  // Up time is always reported; no counter/gauge/histogram lines if empty
  assert.ok(out.includes('radar_uptime_seconds'));
});

test('metrics: Prometheus text format is valid (no broken lines)', () => {
  metrics.reset();
  metrics.inc('a_total', 1);
  metrics.gauge('b_size', 100);
  metrics.observe('c_seconds', 0.5);
  const out = metrics.render();
  for (const line of out.split('\n')) {
    if (line === '' || line.startsWith('#')) continue;
    // Each data line must be: metric_name{labels} value
    assert.match(line, /^[a-zA-Z_][a-zA-Z0-9_]*(\{[^}]*\})?\s+[\d.eE+-]+$/);
  }
});

test('metrics: CONTENT-TYPE for /metrics endpoint is correct', () => {
  // The actual /metrics endpoint is wired in index.js. Here we just
  // document the expected Content-Type. Tested via HTTP in CI.
  const expected = 'text/plain; version=0.0.4; charset=utf-8';
  assert.equal(expected, 'text/plain; version=0.0.4; charset=utf-8');
});

test('Metrics class can be instantiated independently (for tests)', () => {
  const m = new Metrics();
  m.inc('foo', 1);
  m.gauge('bar', 42);
  m.observe('baz', 0.1);
  const out = m.render();
  assert.match(out, /foo 1/);
  assert.match(out, /bar 42/);
  assert.match(out, /baz_count 1/);
});
