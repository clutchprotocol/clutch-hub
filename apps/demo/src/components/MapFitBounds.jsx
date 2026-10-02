import React, { useCallback, useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

/**
 * Fits the map view to show all given positions (e.g. pickup and dropoff).
 * Adds padding so markers are not at the edge.
 *
 * A map created inside a closed panel (display: none) has a 0 x 0 size. Its first fit is then wrong and
 * its tiles never load, which left the Network tab's map blank. Leaflet only learns the real size from
 * invalidateSize(), so every fit asks for that first, and a ResizeObserver fits once more the first time
 * the container gets a size. It does not fit again on later resizes, so it never undoes a pan or zoom.
 */
const MapFitBounds = ({ positions, padding = 24 }) => {
  const map = useMap();

  const fit = useCallback(() => {
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

  useEffect(() => {
    fit();
  }, [fit]);

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return undefined;
    const el = map.getContainer();
    const isHidden = () => el.clientWidth === 0 || el.clientHeight === 0;
    let hidden = isHidden();
    const observer = new ResizeObserver(() => {
      const nowHidden = isHidden();
      if (hidden && !nowHidden) fit();
      hidden = nowHidden;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [map, fit]);

  return null;
};

export default MapFitBounds;
