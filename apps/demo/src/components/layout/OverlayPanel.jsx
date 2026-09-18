import React from 'react';

/**
 * Full-screen overlay above the map. Always mounted; toggled with
 * hidden/display:none (repo convention — keeps inner maps and
 * subscriptions alive, same as App's tab panels).
 */
const OverlayPanel = ({ open, title, onClose, children }) => (
  <div
    className="overlay-panel"
    role="dialog"
    aria-label={title}
    hidden={!open}
    style={{ display: open ? 'flex' : 'none' }}
  >
    <div className="overlay-panel-header">
      <h2 className="overlay-panel-title">{title}</h2>
      <button type="button" className="overlay-panel-close" onClick={onClose} aria-label="Close">
        ×
      </button>
    </div>
    <div className="overlay-panel-body">{children}</div>
  </div>
);

export default OverlayPanel;
