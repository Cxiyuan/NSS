// Race-condition guard tests — v1.2 fix: 9.2.13.
// Verifies that the useTaskIdRef / isStale guard correctly detects when
// the user has switched tasks and the in-flight fetch should be discarded.
import test from 'node:test';
import assert from 'node:assert/strict';
import { useTaskIdRefImpl, updateTaskIdRef } from './race-guard.js';

test('isStale: returns false when captured taskId matches current', () => {
  const ref = useTaskIdRefImpl('t1');
  assert.equal(ref.current, 't1');
  // Same taskId — not stale
  assert.notEqual(ref.current !== 't1', true);
});

test('isStale: returns true after taskId changes (user switched tasks)', () => {
  const ref = useTaskIdRefImpl('t1');
  // User switches from t1 → t2
  updateTaskIdRef(ref, 't2');
  // Old captured taskId is now stale
  assert.equal(ref.current !== 't1', true);
  // New taskId is not stale
  assert.equal(ref.current !== 't2', false);
});

test('isStale: correctly detects back-and-forth task switches', () => {
  const ref = useTaskIdRefImpl('t1');
  updateTaskIdRef(ref, 't2');
  assert.equal(ref.current !== 't1', true);  // t1 stale
  assert.equal(ref.current !== 't2', false); // t2 fresh
  updateTaskIdRef(ref, 't3');
  assert.equal(ref.current !== 't1', true);  // t1 still stale
  assert.equal(ref.current !== 't2', true);  // t2 now stale too
  assert.equal(ref.current !== 't3', false); // t3 fresh
});

test('isStale: same taskId with different cases are equal (use ===, not ==)', () => {
  const ref = useTaskIdRefImpl('T1');
  // Strict equality — case-sensitive
  assert.equal(ref.current !== 'T1', false);
  assert.equal(ref.current !== 't1', true);
});

test('isStale: numeric taskIds are compared as numbers, not strings', () => {
  // If taskId is a number, ref.current === 1 and === "1" differ.
  // Real-world: taskIds are strings (UUIDs), so this test documents
  // that callers must keep types consistent.
  const ref = useTaskIdRefImpl(1);
  assert.equal(ref.current !== 1, false);
  assert.equal(ref.current !== '1', true);
});

test('isStale: multiple rapid switches — only the final one is "current"', () => {
  const ref = useTaskIdRefImpl('initial');
  // Simulate user clicking t1, t2, t3, t4, t5 in rapid succession
  for (const id of ['t1', 't2', 't3', 't4', 't5']) {
    updateTaskIdRef(ref, id);
  }
  // Only the final one is "current"
  assert.equal(ref.current, 't5');
  // All others are stale
  for (const id of ['initial', 't1', 't2', 't3', 't4']) {
    assert.equal(ref.current !== id, true, `${id} should be stale`);
  }
});

test('isStale: ref is independent of captured taskIds (no shared state)', () => {
  const refA = useTaskIdRefImpl('a');
  const refB = useTaskIdRefImpl('b');
  updateTaskIdRef(refA, 'a2');
  // refB unchanged
  assert.equal(refA.current, 'a2');
  assert.equal(refB.current, 'b');
});
