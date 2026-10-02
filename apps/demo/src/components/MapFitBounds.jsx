import React, { useCallback, useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

const hasSize = (el) => el.clientWidth > 0 && el.clientHeight > 0;

/**
 * Fits the map view to show all given positions (e.g. pickup and dropoff).
 * Adds padding so markers are not at the edge.
 *
 * A map inside a closed panel (display: none) has a 0 x 0 container. Leaflet fits against a negative size
 * there, jumps to the max zoom and keeps the 0 x 0 size, so the tiles never load once the panel opens (the
 * Network tab's map was a blank grey box). So a fit does nothing while the container has no size, and every
 * fit calls invalidateSize() first, so Leaflet reads the real size. The fit runs again on the render that
 * shows the panel or, if there is none, when a ResizeObserver sees the container go from no size to a size.
 * It does not fit again on later resizes.
 */
const MapFitBounds = ({ positions, padding = 24 }) => {
  const map = useMap();

  const fit = useCallback(() => {
    if (!hasSize(map.getContainer())) return;
    if (!positions || positions.length === 0) return;
    const valid = positions
      .filter((p) => Array.isArray(p) && p.length >= 2)
      .map((p) => [Number(p[0]), Number(p[1])])
      .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
    if (valid.length === 0) return;
    const bounds = L.latLngBounds(valid);
    if (bounds.isValid()) {
      map.invalidateSize();
      map.fitBounds(bounds, { padding: [padding, padding], maxZoom: 16 });
    }
  }, [map, positions, padding]);

  // The observer lives as long as the map, so it calls the newest fit through a ref.
  const fitRef = useRef(fit);
  useEffect(() => {
    fitRef.current = fit;
  }, [fit]);

  useEffect(() => {
    fit();
  }, [fit]);

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return undefined;
    const el = map.getContainer();
    let sized = hasSize(el);
    const observer = new ResizeObserver(() => {
      const nowSized = hasSize(el);
      if (!sized && nowSized) fitRef.current();
      sized = nowSized;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [map]);

  return null;
};

export default MapFitBounds;
