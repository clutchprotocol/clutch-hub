import React from 'react';

const MapLegend = ({ style }) => {
  return (
    <div className="map-legend" style={style}>
      <span className="map-legend-item">
        <span className="map-point-icon map-point-icon--pickup map-legend-icon">
          <span>P</span>
        </span>
        <span className="map-legend-label">Pickup</span>
      </span>
      <span className="map-legend-item">
        <span className="map-point-icon map-point-icon--dropoff map-legend-icon">
          <span>D</span>
        </span>
        <span className="map-legend-label">Dropoff</span>
      </span>
    </div>
  );
};

export default MapLegend;
