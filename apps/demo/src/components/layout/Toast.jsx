import React from 'react';

/**
 * Floating status toast. Caller owns the status state and its auto-clear
 * timeout (existing behaviour); errors get an explicit dismiss button.
 */
const Toast = ({ status, onDismiss }) => {
  if (!status) return null;
  return (
    <div className="toast-stack">
      <div className={`toast toast--${status.type}`} role="status">
        <span className="toast-message">{status.message}</span>
        {status.type === 'error' && (
          <button type="button" className="toast-dismiss" onClick={onDismiss} aria-label="Dismiss">
            ×
          </button>
        )}
      </div>
    </div>
  );
};

export default Toast;
