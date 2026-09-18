import React, { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

/**
 * Fits the map view to show all given positions (e.g. pickup and dropoff).
 * Adds padding so markers are not at the edge.
 */
const MapFitBounds = ({ positions, padding = 24 }) => {
  const map = useMap();

  useEffect(() => {
    if (!positions || positions.length === 0) return;
    const valid = positions
      .filter((p) => Array.isArray(p) && p.length >= 2)
      .map((p) => [Number(p[0]), Number(p[1])])
      .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
    if (valid.length === 0) return;
    const bounds = L.latLngBounds(valid);
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [padding, padding], maxZoom: 16 });
    }
  }, [map, positions, padding]);

  return null;
};

export default MapFitBounds;
