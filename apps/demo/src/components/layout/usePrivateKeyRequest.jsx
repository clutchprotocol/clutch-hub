import React, { useCallback, useRef, useState } from 'react';

/**
 * Displays an in-app modal to collect a private key (avoids disruptive window.prompt()).
 * Returns a promise resolved with the key string or `null` if the user cancels.
 */
export function usePrivateKeyRequest() {
  const resolverRef = useRef(null);

  const [open, setOpen] = useState(false);
  const [promptTitle, setPromptTitle] = useState('Private key required');
  const [promptDesc, setPromptDesc] = useState('Enter your private key to sign this action.');
  const [value, setValue] = useState('');
  const [error, setError] = useState(null);

  const finish = useCallback((result) => {
    const resolver = resolverRef.current;
    resolverRef.current = null;
    setOpen(false);
    setValue('');
    setError(null);
    if (resolver) resolver(result);
  }, []);

  const requestPrivateKey = useCallback(
    (titleOrText) =>
      new Promise((resolve) => {
        resolverRef.current = resolve;
        setError(null);

        if (typeof titleOrText === 'string') {
          // Allow passing either a full title or a combined message.
          const txt = titleOrText.trim();
          setPromptTitle(txt.length > 0 ? 'Private key required' : 'Private key required');
          setPromptDesc(txt.length > 0 ? txt : 'Enter your private key to sign this action.');
        }

        setOpen(true);
      }),
    []
  );

  const onConfirm = useCallback(() => {
    const pk = value.trim();
    if (!pk) {
      setError('Private key is required.');
      return;
    }
    finish(pk);
  }, [finish, value]);

  const PrivateKeyModal = useCallback(() => {
    if (!open) return null;
    return (
      <div
        className="pk-modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="Private key required"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) finish(null);
        }}
      >
        <div className="pk-modal card">
          <div className="pk-modal-header">
            <h3 className="pk-modal-title">{promptTitle}</h3>
            <p className="pk-modal-desc">{promptDesc}</p>
          </div>

          <div className="pk-modal-body">
            <label className="label" htmlFor="privateKeyInput">
              Private key
            </label>
            <input
              id="privateKeyInput"
              className="input-field"
              type="password"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Enter your private key"
              autoFocus
            />
            <p className="pk-modal-help">Never share your private key.</p>
            {error && <div className="status-banner error" style={{ marginTop: '0.75rem' }}>{error}</div>}
          </div>

          <div className="pk-modal-actions">
            <button type="button" className="btn-secondary" onClick={() => finish(null)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={onConfirm} disabled={!value.trim()}>
              Continue
            </button>
          </div>
        </div>
      </div>
    );
  }, [error, finish, onConfirm, open, promptDesc, promptTitle, value]);

  return { PrivateKeyModal, requestPrivateKey };
}

