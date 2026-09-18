import React, { useState } from 'react';

const ChevronDown = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const Section = ({
  title,
  icon,
  description,
  children,
  collapsible = false,
  defaultExpanded = true,
  action,
  badge,
  className = '',
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <section className={`section ${className}`}>
      <div className="section-header">
        <div className="section-title-row">
          <h2 className="section-title">
            {icon && <span className="section-icon">{icon}</span>}
            {title}
            {badge != null && <span className="section-badge">{badge}</span>}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {action}
            {collapsible && (
              <button
                type="button"
                className="section-toggle"
                onClick={() => setExpanded((e) => !e)}
                aria-expanded={expanded}
                style={{ transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform var(--transition)' }}
              >
                <ChevronDown />
              </button>
            )}
          </div>
        </div>
        {description && <p className="section-description">{description}</p>}
      </div>
      {(!collapsible || expanded) && <div className="section-content">{children}</div>}
    </section>
  );
};

export default Section;
