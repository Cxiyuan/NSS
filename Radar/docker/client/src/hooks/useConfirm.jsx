import { useState, useCallback, useEffect, useRef } from 'react';

export default function useConfirm() {
  const [state, setState] = useState({ open: false, message: '' });
  const resolverRef = useRef(null);

  const confirm = useCallback((message) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setState({ open: true, message });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    resolverRef.current?.(true);
    setState({ open: false, message: '' });
  }, []);

  const handleCancel = useCallback(() => {
    resolverRef.current?.(false);
    setState({ open: false, message: '' });
  }, []);

  useEffect(() => {
    if (!state.open) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [state.open, handleCancel]);

  const ConfirmDialog = state.open ? (
    <div style={overlayStyle} onClick={handleCancel}>
      <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
        <p style={{ margin: '0 0 1.25rem', fontSize: '0.95rem', color: '#1f2937' }}>
          {state.message}
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button style={cancelBtnStyle} onClick={handleCancel}>
            Cancel
          </button>
          <button style={confirmBtnStyle} onClick={handleConfirm}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirm, ConfirmDialog };
}

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 10000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'rgba(0, 0, 0, 0.35)',
};

const dialogStyle = {
  backgroundColor: '#fff',
  borderRadius: 10,
  padding: '1.25rem 1.5rem',
  minWidth: 300,
  maxWidth: 420,
  boxShadow: '0 8px 30px rgba(0,0,0,0.2)',
};

const cancelBtnStyle = {
  padding: '0.45rem 1rem',
  fontSize: '0.85rem',
  fontWeight: 600,
  color: '#374151',
  backgroundColor: '#f3f4f6',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  cursor: 'pointer',
};

const confirmBtnStyle = {
  padding: '0.45rem 1rem',
  fontSize: '0.85rem',
  fontWeight: 600,
  color: '#fff',
  backgroundColor: '#dc2626',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
};
