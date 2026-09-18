import React from 'react';

/**
 * Flexible tab bar with optional counts. Supports pill (segment) or underline variants.
 * @param {Object} props
 * @param {Array<{ id: string, label: string, count?: number, icon?: string }>} props.tabs
 * @param {string} props.activeTab
 * @param {(id: string) => void} props.onTabChange
 * @param {'pill'|'underline'} [props.variant='pill']
 * @param {boolean} [props.showCounts=true] - Show count badges when tab has count > 0
 */
const ExplorerTabs = ({
  tabs,
  activeTab,
  onTabChange,
  variant = 'pill',
  showCounts = true,
}) => (
  <div className={`explorer-tabs explorer-tabs--${variant}`} role="tablist">
    {tabs.map((tab) => {
      const isActive = activeTab === tab.id;
      const hasCount = showCounts && typeof tab.count === 'number' && tab.count > 0;
      return (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={isActive}
          aria-controls={`panel-${tab.id}`}
          id={`tab-${tab.id}`}
          className={`explorer-tab ${isActive ? 'active' : ''}`}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.icon && <span className="explorer-tab-icon" aria-hidden>{tab.icon}</span>}
          <span className="explorer-tab-label">{tab.label}</span>
          {hasCount && (
            <span className="explorer-tab-badge">{tab.count}</span>
          )}
        </button>
      );
    })}
  </div>
);

export default ExplorerTabs;
