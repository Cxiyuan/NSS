import { useState } from 'react';

/**
 * ConfirmDialog — replaces window.confirm with a styled modal.
 *
 * Usage:
 *   const [confirm, setConfirm] = useState(null); // null | { message, onConfirm }
 *   {confirm && (
 *     <ConfirmDialog
 *       message={confirm.message}
 *       onCancel={() => setConfirm(null)}
 *       onConfirm={() => { setConfirm(null); confirm.onConfirm(); }}
 *     />
 *   )}
 */
export default function ConfirmDialog({ message, onCancel, onConfirm, confirmText = '确定', cancelText = '取消' }) {
  return (
    <div
      className="confirm-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-message"
      onClick={onCancel}>
      <div
        className="confirm-dialog"
        onClick={e => e.stopPropagation()}
        // v1.2.QA Sprint 2 A3-2: trap focus in the modal by making the
        // dialog the focused element. Native focus management is enough
        // for a 2-button confirm; a full focus-trap is overkill here.
        tabIndex={-1}
        ref={el => el?.focus()}>
        <p id="confirm-message" className="confirm-dialog__message">{message}</p>
        <div className="confirm-dialog__actions">
          <button
            className="confirm-dialog__cancel"
            onClick={onCancel}
            aria-label={cancelText}>
            {cancelText}
          </button>
          <button
            className="confirm-dialog__confirm"
            onClick={onConfirm}
            aria-label={confirmText}
            autoFocus>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
