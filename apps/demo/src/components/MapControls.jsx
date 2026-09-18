import { useEffect } from 'react';
import { useMap, useMapEvents } from 'react-leaflet';

// Headless map behaviour. Each of these renders null and exists only to reach the Leaflet
// instance through react-leaflet's context, which is only available to a child of MapContainer.

const LocationSelector = ({ pickup, dropoff, setPickup, setDropoff }) => {
  useMapEvents({
    click(e) {
      if (!pickup) setPickup(e.latlng);
      else if (!dropoff) setDropoff(e.latlng);
    },
  });
  return null;
};

const MapCenterTracker = ({ onCenterChange }) => {
  const map = useMap();
  useEffect(() => {
    const c = map.getCenter();
    onCenterChange?.({ lat: Number(c.lat), lng: Number(c.lng) });
  }, [map, onCenterChange]);
  useMapEvents({
    moveend(e) {
      const c = e.target.getCenter();
      onCenterChange?.({ lat: Number(c.lat), lng: Number(c.lng) });
    },
  });
  return null;
};

const MapFlyToLocation = ({ location }) => {
  const map = useMap();

  useEffect(() => {
    if (!location) return;
    const lat = Number(location.lat);
    const lng = Number(location.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const container = map.getContainer?.();
    const isVisible = !!container && container.offsetWidth > 0 && container.offsetHeight > 0;
    if (!isVisible) return;
    const zoom = Number(map.getZoom());
    const safeZoom = Number.isFinite(zoom) ? Math.max(zoom, 14) : 14;
    try {
      map.flyTo([lat, lng], safeZoom, { duration: 0.7 });
    } catch (err) {
      // Hidden/inactive maps can still throw inside Leaflet animations; ignore safely.
      console.warn('Skipped map flyTo due to invalid map state:', err);
    }
  }, [location, map]);

  return null;
};

export { LocationSelector, MapCenterTracker, MapFlyToLocation };
