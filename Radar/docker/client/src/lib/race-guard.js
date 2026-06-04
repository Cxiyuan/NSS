// useTaskIdRef — race-condition guard for in-flight fetches in React hooks.
// v1.2 fix: 9.2.13 — when user switches tasks, in-flight fetches from the
// previous task can resolve and pollute the new task's UI state.
//
// Usage:
//   const taskIdRef = useTaskIdRef(taskId);
//   async function loadResults() {
//     const reqTaskId = taskId;
//     const data = await api.getResults(taskId);
//     if (taskIdRef.isStale(reqTaskId)) return;  // task changed — discard
//     setResults(data);
//   }
import { useRef, useEffect } from 'react';

export function useTaskIdRef(taskId) {
  const ref = useTaskIdRefImpl(taskId);
  return {
    get current() { return ref.current; },
    isStale(capturedTaskId) {
      return ref.current !== capturedTaskId;
    },
  };
}

// Pure-logic core: a {current, set} pair with a setCurrent setter.
// Kept separate from the React hook so we can unit-test the guard logic
// without rendering.
export function useTaskIdRefImpl(initial) {
  const ref = { current: initial };
  return ref;
}

export function updateTaskIdRef(ref, newValue) {
  ref.current = newValue;
}
