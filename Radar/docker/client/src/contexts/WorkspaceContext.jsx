import { createContext, useContext, useReducer, useEffect, useRef } from 'react';

const WorkspaceContext = createContext(null);
const TASK_CACHE_MAX = 3;
const RIGHT_PANEL_ANIMATION_MS = 300;

const initialState = {
  activeTaskId: null,
  activeView: 'idle',
  activeSubTab: 'results',
  rightPanelContent: null,
  rightPanelOpen: false,
  rightPanelPinned: false,
  sidebarCollapsed: false,
  mobileSidebarOpen: false,
  bottomPanelOpen: false,
  bottomPanelHeight: 240,
  paletteOpen: false,
  taskCache: {},
  activityEvents: [],
};

function workspaceReducer(state, action) {
  switch (action.type) {
    case 'SELECT_TASK': {
      const { taskId, subTab } = action.payload;
      const nextCache = { ...state.taskCache };

      // Save current subTab to cache for the task being navigated away from
      if (state.activeTaskId) {
        const prev = nextCache[state.activeTaskId] || {};
        nextCache[state.activeTaskId] = { ...prev, activeSubTab: state.activeSubTab };
      }

      // Use explicit subTab from URL first; fall back to cached value or 'results'
      const cached = nextCache[taskId];
      const activeSubTab = subTab || (cached && cached.activeSubTab) || 'results';

      // Enforce max cache size — evict oldest entry if we are adding a new key
      const keys = Object.keys(nextCache);
      if (!(taskId in nextCache) && keys.length >= TASK_CACHE_MAX) {
        const oldest = keys.find((k) => k !== taskId);
        if (oldest) delete nextCache[oldest];
      }

      // Ensure the current task always has an entry
      nextCache[taskId] = { ...(nextCache[taskId] || {}), activeSubTab };

      return {
        ...state,
        activeTaskId: taskId,
        activeView: 'task-workspace',
        activeSubTab,
        taskCache: nextCache,
      };
    }

    case 'CLOSE_TASK':
      return {
        ...state,
        activeTaskId: null,
        activeView: 'idle',
      };

    case 'SET_VIEW': {
      const view = action.payload;
      return {
        ...state,
        activeView: view,
        activeTaskId: view === 'idle' ? null : state.activeTaskId,
      };
    }

    case 'SET_SUB_TAB': {
      const subTab = action.payload;
      const nextCache = { ...state.taskCache };
      if (state.activeTaskId) {
        nextCache[state.activeTaskId] = {
          ...(nextCache[state.activeTaskId] || {}),
          activeSubTab: subTab,
        };
      }
      return {
        ...state,
        activeSubTab: subTab,
        taskCache: nextCache,
      };
    }

    case 'OPEN_RIGHT_PANEL':
      return {
        ...state,
        rightPanelContent: action.payload,
        rightPanelOpen: true,
      };

    case 'CLOSE_RIGHT_PANEL':
      return {
        ...state,
        rightPanelOpen: false,
      };

    case 'CLEAR_RIGHT_PANEL_CONTENT':
      return {
        ...state,
        rightPanelContent: null,
      };

    case 'TOGGLE_PIN':
      return {
        ...state,
        rightPanelPinned: !state.rightPanelPinned,
      };

    case 'TOGGLE_SIDEBAR':
      return {
        ...state,
        sidebarCollapsed: !state.sidebarCollapsed,
      };

    case 'TOGGLE_BOTTOM_PANEL':
      return {
        ...state,
        bottomPanelOpen: !state.bottomPanelOpen,
      };

    case 'SET_MOBILE_SIDEBAR':
      return {
        ...state,
        mobileSidebarOpen: !!action.payload,
      };

    case 'SET_PALETTE':
      return {
        ...state,
        paletteOpen: Boolean(action.payload),
      };

    case 'ADD_ACTIVITY_EVENT':
      return { ...state, activityEvents: [action.payload, ...state.activityEvents].slice(0, 50) };

    default:
      return state;
  }
}

export function WorkspaceProvider({ children }) {
  const [state, dispatch] = useReducer(workspaceReducer, initialState);
  const closeTimer = useRef(null);

  // When rightPanel transitions to closed, defer content clearing so the
  // CSS close-animation can play out.
  useEffect(() => {
    if (!state.rightPanelOpen) {
      closeTimer.current = setTimeout(() => {
        dispatch({ type: 'CLEAR_RIGHT_PANEL_CONTENT' });
      }, RIGHT_PANEL_ANIMATION_MS);
    }
    return () => {
      if (closeTimer.current) {
        clearTimeout(closeTimer.current);
        closeTimer.current = null;
      }
    };
  }, [state.rightPanelOpen]);

  return (
    <WorkspaceContext.Provider value={{ state, dispatch }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return ctx;
}
