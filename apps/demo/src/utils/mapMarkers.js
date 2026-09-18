import L from 'leaflet';

const pickupIcon = L.divIcon({
  className: 'map-point-icon-wrap',
  html: '<div class="map-point-icon map-point-icon--pickup"><span>P</span></div>',
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  popupAnchor: [0, -24],
});

const dropoffIcon = L.divIcon({
  className: 'map-point-icon-wrap',
  html: '<div class="map-point-icon map-point-icon--dropoff"><span>D</span></div>',
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  popupAnchor: [0, -24],
});

const currentLocationIcon = L.divIcon({
  className: 'map-point-icon-wrap',
  html: '<div class="map-current-location-icon"><span class="map-current-location-dot"></span></div>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, -12],
});

export { pickupIcon, dropoffIcon, currentLocationIcon };
