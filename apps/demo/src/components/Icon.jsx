import React from 'react';

/**
 * Material Symbols Outlined icon wrapper for Kinetic Precision design.
 * @param {string} name - Icon name (e.g. 'menu', 'arrow_back', 'location_on')
 * @param {string|number} size - Icon size (default 24)
 * @param {number} fill - Fill value 0 or 1
 * @param {string} className - Additional CSS classes
 */
const Icon = ({ name, size = 24, fill = 0, className = '' }) => (
  <span
    className={`material-symbols-outlined ${className}`}
    style={{
      fontSize: typeof size === 'number' ? `${size}px` : size,
      fontVariationSettings: `'FILL' ${fill}, 'wght' 400, 'GRAD' 0, 'opsz' 24`,
    }}
    aria-hidden
  >
    {name}
  </span>
);

export default Icon;
