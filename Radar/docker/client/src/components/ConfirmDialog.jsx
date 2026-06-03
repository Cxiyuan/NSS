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
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={e => e.stopPropagation()}>
        <p className="confirm-dialog__message">{message}</p>
        <div className="confirm-dialog__actions">
          <button className="confirm-dialog__cancel" onClick={onCancel}>{cancelText}</button>
          <button className="confirm-dialog__confirm" onClick={onConfirm}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
}
