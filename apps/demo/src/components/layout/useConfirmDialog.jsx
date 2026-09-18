import React, { useCallback, useRef, useState } from 'react';

/**
 * Small generic confirm dialog.
 * Returns `{ ConfirmModal, requestConfirm }`.
 * `requestConfirm()` resolves to `true` when user confirms, otherwise `false`.
 */
export function useConfirmDialog() {
  const resolverRef = useRef(null);

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('Confirm');
  const [desc, setDesc] = useState('');
  const [confirmText, setConfirmText] = useState('Confirm');
  const [cancelText, setCancelText] = useState('Cancel');

  const finish = useCallback((result) => {
    const resolver = resolverRef.current;
    resolverRef.current = null;
    setOpen(false);
    if (resolver) resolver(result);
  }, []);

  const requestConfirm = useCallback(({ title: t, desc: d, confirmText: c, cancelText: x } = {}) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setTitle(t || 'Confirm');
      setDesc(d || '');
      setConfirmText(c || 'Confirm');
      setCancelText(x || 'Cancel');
      setOpen(true);
    });
  }, []);

  const ConfirmModal = useCallback(() => {
    if (!open) return null;
    return (
      <div
        className="pk-modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="Confirmation dialog"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) finish(false);
        }}
      >
        <div className="pk-modal card">
          <div className="pk-modal-header">
            <h3 className="pk-modal-title">{title}</h3>
            {desc && <p className="pk-modal-desc">{desc}</p>}
          </div>

          <div className="pk-modal-body" style={{ paddingTop: 0 }}>
            {/* Intentionally empty: modal is just header + buttons */}
          </div>

          <div className="pk-modal-actions">
            <button type="button" className="btn-secondary" onClick={() => finish(false)}>
              {cancelText}
            </button>
            <button type="button" className="btn-primary" onClick={() => finish(true)}>
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    );
  }, [cancelText, confirmText, desc, finish, open, title]);

  return { ConfirmModal, requestConfirm };
}

