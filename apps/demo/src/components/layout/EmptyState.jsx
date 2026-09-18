import React from 'react';

const EmptyIcon = () => (
  <svg viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" />
    <line x1="8" y1="15" x2="16" y2="15" />
    <line x1="9" y1="9" x2="9.01" y2="9" strokeWidth="2" />
    <line x1="15" y1="9" x2="15.01" y2="9" strokeWidth="2" />
  </svg>
);

const EmptyState = ({ message, action, onAction, actionDisabled, className = '' }) => (
  <div className={`empty-state ${className}`}>
    <div className="empty-state-icon">
      <EmptyIcon />
    </div>
    <p className="empty-state-message">{message}</p>
    {action && onAction && (
      <div className="empty-state-action">
        <button
          type="button"
          className="btn-primary"
          onClick={onAction}
          disabled={actionDisabled}
          style={{ fontSize: '0.8rem' }}
        >
          {action}
        </button>
      </div>
    )}
  </div>
);

export default EmptyState;
