import { useState, useEffect, useCallback } from 'react';

/**
 * Parse a window.location.hash value into a route object.
 *
 * Supported patterns:
 *   #/task/<taskId>/<subTab>  → { taskId, view: 'workspace', subTab }
 *   #/task/<taskId>            → { taskId, view: 'workspace', subTab: 'results' }
 *   #/config                   → { taskId: null, view: 'config',  subTab: null }
 *   #/                         → { taskId: null, view: 'idle',   subTab: null }
 *   (empty / no hash)          → { taskId: null, view: 'idle',   subTab: null }
 */
function parseHash(hash) {
  const clean = hash.replace(/^#/, '').trim();

  // #/task/<taskId>[/<subTab>]
  const taskMatch = clean.match(/^\/task\/([^/]+)(?:\/([^/]+))?$/);
  if (taskMatch) {
    if (!taskMatch[1] || taskMatch[1].trim() === '') {
      return { taskId: null, view: 'idle', subTab: null };
    }
    const subTab = taskMatch[2] || 'results';
    // Only allow recognised sub-tab values
    const validSubTabs = ['results', 'analytics', 'logs'];
    return {
      taskId: decodeURIComponent(taskMatch[1]),
      view: 'workspace',
      subTab: validSubTabs.includes(subTab) ? subTab : 'results',
    };
  }

  if (clean === '/new') {
    return { taskId: null, view: 'task-workspace', subTab: null };
  }

  if (clean === '/config') {
    return { taskId: null, view: 'config', subTab: null };
  }

  if (clean === '/analytics') {
    return { taskId: null, view: 'analytics', subTab: null };
  }

  // Default — idle
  return { taskId: null, view: 'idle', subTab: null };
}

/**
 * Build a hash string from routing parameters.
 */
function buildHash(view, ...args) {
  switch (view) {
    case 'workspace': {
      const [taskId, subTab] = args;
      const base = `#/task/${encodeURIComponent(taskId)}`;
      return subTab ? `${base}/${subTab}` : base;
    }
    case 'new':
      return '#/new';
    case 'config':
      return '#/config';
    case 'analytics':
      return '#/analytics';
    default:
      return '#/';
  }
}

export function useHashRouting() {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));

  useEffect(() => {
    const onHashChange = () => {
      setRoute(parseHash(window.location.hash));
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigateTo = useCallback((view, ...args) => {
    // Use location.hash assignment so the back button creates a
    // proper history entry.
    window.location.hash = buildHash(view, ...args);
  }, []);

  return {
    taskId: route.taskId,
    view: route.view,
    subTab: route.subTab,
    navigateTo,
  };
}
