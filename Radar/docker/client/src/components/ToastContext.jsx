import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

const ToastContext = createContext(null);

const TOAST_TYPES = {
  success: { icon: '✓', bg: '#10b981' },
  error: { icon: '✗', bg: '#ef4444' },
  info: { icon: 'ℹ', bg: '#3b82f6' },
  warning: { icon: '⚠', bg: '#f59e0b' },
};

const MAX_TOASTS = 5;
const DISMISS_MS = 4000;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef({});

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    delete timersRef.current[id];
  }, []);

  const addToast = useCallback(
    (message, type = 'info') => {
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const toast = { id, message, type };

      setToasts((prev) => {
        const next = [...prev, toast];
        return next.length > MAX_TOASTS ? next.slice(next.length - MAX_TOASTS) : next;
      });

      timersRef.current[id] = setTimeout(() => removeToast(id), DISMISS_MS);

      return id;
    },
    [removeToast],
  );

  useEffect(() => {
    return () => {
      Object.values(timersRef.current).forEach(clearTimeout);
    };
  }, []);

  return (
    <ToastContext.Provider value={addToast}>
      {children}
      {/* v1.2.QA Sprint 2 A3-2: ARIA live region. role="alert" + aria-live
          "assertive" tells screen readers to interrupt and announce each
          toast immediately (errors/info need urgent attention; success is
          less so — we set assertive for error, polite for the rest). */}
      <div
        style={containerStyle}
        role="region"
        aria-label="Notifications"
      >
        {toasts.map((t) => {
          const typeMeta = TOAST_TYPES[t.type] || TOAST_TYPES.info;
          const isUrgent = t.type === 'error';
          return (
            <div
              key={t.id}
              role={isUrgent ? 'alert' : 'status'}
              aria-live={isUrgent ? 'assertive' : 'polite'}
              aria-atomic="true"
              role="alert"
              style={{
                ...toastStyle,
                backgroundColor: typeMeta.bg,
              }}
            >
              <span style={{ marginRight: 8, fontWeight: 700 }}>{typeMeta.icon}</span>
              <span style={{ flex: 1 }}>{t.message}</span>
              <button
                onClick={() => removeToast(t.id)}
                style={closeBtnStyle}
                aria-label="Dismiss"
              >
                &times;
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}

const containerStyle = {
  position: 'fixed',
  bottom: 16,
  right: 16,
  zIndex: 9999,
  display: 'flex',
  flexDirection: 'column-reverse',
  gap: 8,
  maxWidth: 380,
};

const toastStyle = {
  display: 'flex',
  alignItems: 'center',
  padding: '10px 14px',
  borderRadius: 8,
  color: '#fff',
  fontSize: '0.875rem',
  lineHeight: 1.4,
  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
  animation: 'slideIn 0.25s ease-out',
};

const closeBtnStyle = {
  marginLeft: 10,
  background: 'none',
  border: 'none',
  color: '#fff',
  fontSize: '1.25rem',
  cursor: 'pointer',
  lineHeight: 1,
  padding: '0 2px',
  opacity: 0.8,
};
