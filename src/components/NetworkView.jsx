import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import MapFitBounds from './MapFitBounds';
import ActiveTripCard from './ActiveTripCard';
import CompletedTripCard from './CompletedTripCard';
import ExplorerTabs from './ExplorerTabs';
import { Section, EmptyState } from './layout';
import L from 'leaflet';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';
import { API_URL, MAP_ATTRIBUTION, MAP_TILE_URL } from '../config';
import { useClutchSdk } from '../hooks/useClutchSdk';
import { truncAddr } from '../utils/address';
import { formatUsd } from '../utils/money';
import Icon from './Icon';
import {
  subscribeActiveTripsCompat,
  subscribeRecentTripsCompat,
  subscribeRideOffersCompat,
  subscribeRideRequestsCompat,
} from '../sdkRealtime';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

const DEFAULT_CENTER = [27.1883, 56.3772];
const DEFAULT_ZOOM = 12;

const NetworkView = () => {
  const [activeTab, setActiveTab] = useState('requests');
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rideRequests, setRideRequests] = useState([]);
  const [ridesLoading, setRidesLoading] = useState(false);
  const [ridesError, setRidesError] = useState(null);
  const [selectedTxHash, setSelectedTxHash] = useState(null);
  const [offers, setOffers] = useState([]);
  const [offersLoading, setOffersLoading] = useState(false);
  const [activeTrips, setActiveTrips] = useState([]);
  const [activeTripsLoading, setActiveTripsLoading] = useState(false);
  const [activeTripsError, setActiveTripsError] = useState(null);
  const [recentTrips, setRecentTrips] = useState([]);
  const [recentTripsLoading, setRecentTripsLoading] = useState(false);
  const [recentTripsError, setRecentTripsError] = useState(null);

  const sdk = useClutchSdk(undefined, '0x0');

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`${API_URL.replace(/\/$/, '')}/health`);
        const data = await res.json();
        setHealth(data);
      } catch (err) {
        setError(err.message || 'Failed to reach API');
        setHealth(null);
      } finally {
        setLoading(false);
      }
    };
    fetchHealth();
    const interval = setInterval(fetchHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setRidesLoading(true);
    setRidesError(null);
    const dispose = subscribeRideRequestsCompat(sdk, null, {
      onData: (requests) => {
        setRideRequests(requests);
        setRidesLoading(false);
      },
      onError: (err) => {
        console.error('Ride requests subscription error:', err);
        setRidesError(err.message || 'Failed to load ride requests');
        setRideRequests([]);
        setRidesLoading(false);
      },
    });
    return () => dispose();
  }, [sdk]);

  useEffect(() => {
    setActiveTripsLoading(true);
    setActiveTripsError(null);
    const dispose = subscribeActiveTripsCompat(sdk, undefined, {
      onData: (trips) => {
        setActiveTrips(trips);
        setActiveTripsLoading(false);
      },
      onError: (err) => {
        console.error('Active trips subscription error:', err);
        setActiveTripsError(err.message || 'Failed to load active trips');
        setActiveTrips([]);
        setActiveTripsLoading(false);
      },
    });
    return () => dispose();
  }, [sdk]);

  useEffect(() => {
    setRecentTripsLoading(true);
    setRecentTripsError(null);
    const dispose = subscribeRecentTripsCompat(sdk, undefined, {
      onData: (trips) => {
        setRecentTrips(trips);
        setRecentTripsLoading(false);
      },
      onError: (err) => {
        console.error('Recent trips subscription error:', err);
        setRecentTripsError(err.message || 'Failed to load recent trips');
        setRecentTrips([]);
        setRecentTripsLoading(false);
      },
    });
    return () => dispose();
  }, [sdk]);

  useEffect(() => {
    if (!selectedTxHash) {
      setOffers([]);
      setOffersLoading(false);
      return undefined;
    }
    setOffersLoading(true);
    const dispose = subscribeRideOffersCompat(sdk, selectedTxHash, {
      onData: (list) => {
        setOffers(list);
        setOffersLoading(false);
      },
      onError: (err) => {
        console.error('Offers subscription error:', err);
        setOffers([]);
        setOffersLoading(false);
      },
    });
    return () => dispose();
  }, [sdk, selectedTxHash]);

  const selectedRequest = rideRequests.find((r) => r.txHash === selectedTxHash);

  const apiOk = health?.status === 'healthy';

  return (
    <div className="network-view">
      <div className="explorer-network-header">
        <h2 className="network-title">Network</h2>
        <div className="explorer-network-header-right">
          <span className={`api-status-pill hub-online-pill ${loading ? 'hub-online-pill--loading' : apiOk ? 'hub-online-pill--live' : 'hub-online-pill--error'}`}>
            {loading ? <span className="status-dot" /> : apiOk ? <span className="status-dot status-dot--live" /> : <span className="status-dot status-dot--error" />}
            {loading ? 'Checking...' : error ? 'API Offline' : apiOk ? 'Hub Online' : 'API Unknown'}
          </span>
          <Icon name="sensors" size={22} className="network-sensors-icon" />
        </div>
      </div>
      <div className="explorer-tabs-scroll">
        <ExplorerTabs
          tabs={[
            { id: 'requests', label: 'Ride Requests', icon: '📍', count: rideRequests.length },
            { id: 'trips', label: 'Active Trips', icon: '🚗', count: activeTrips.length },
            { id: 'recent', label: 'Recent rides', icon: '✅', count: recentTrips.length },
          ]}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          variant="pill"
        />
      </div>

      {activeTab === 'requests' && (
        <>
          {ridesError && <div className="status-banner error">{ridesError}</div>}

          {rideRequests.length === 0 && !ridesLoading && !ridesError && (
            <EmptyState message="No active ride requests on the network." />
          )}

          {rideRequests.length > 0 && (
            <>
              <div className="map-wrapper network-map-wrapper">
                <div className="map-gradient-overlay" />
                <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} className="network-map" style={{ width: '100%' }}>
                  <TileLayer url={MAP_TILE_URL} attribution={MAP_ATTRIBUTION} />
                  <MapFitBounds
                    positions={
                      selectedTxHash && selectedRequest
                        ? [
                            [selectedRequest.pickupLocation.latitude, selectedRequest.pickupLocation.longitude],
                            [selectedRequest.dropoffLocation.latitude, selectedRequest.dropoffLocation.longitude],
                          ]
                        : rideRequests.map((r) => [r.pickupLocation.latitude, r.pickupLocation.longitude])
                    }
                  />
                  {rideRequests.map((req) => (
                    <Marker
                      key={req.txHash}
                      position={[req.pickupLocation.latitude, req.pickupLocation.longitude]}
                      eventHandlers={{
                        click: () => setSelectedTxHash((prev) => (prev === req.txHash ? null : req.txHash)),
                      }}
                    >
                      <Popup>
                        <div style={{ maxWidth: 240, fontSize: '0.8rem', lineHeight: 1.6 }}>
                          <strong>Pickup</strong> &mdash; {formatUsd(req.fare)}<br />
                          Dropoff: {req.dropoffLocation.latitude.toFixed(4)}, {req.dropoffLocation.longitude.toFixed(4)}<br />
                          Passenger: {truncAddr(req.passengerAddress)}
                        </div>
                      </Popup>
                    </Marker>
                  ))}
                  {selectedTxHash && selectedRequest && (
                    <>
                      <Polyline
                        positions={[
                          [selectedRequest.pickupLocation.latitude, selectedRequest.pickupLocation.longitude],
                          [selectedRequest.dropoffLocation.latitude, selectedRequest.dropoffLocation.longitude],
                        ]}
                        color="var(--accent)"
                        weight={3}
                        opacity={0.8}
                      />
                      <Marker position={[selectedRequest.dropoffLocation.latitude, selectedRequest.dropoffLocation.longitude]}>
                        <Popup>
                          <div style={{ maxWidth: 240, fontSize: '0.8rem' }}>
                            <strong>Dropoff</strong> &mdash; {formatUsd(selectedRequest.fare)}
                          </div>
                        </Popup>
                      </Marker>
                    </>
                  )}
                </MapContainer>
              </div>

              {selectedRequest && (
                <div className="glass-panel network-selected-overlay">
                  <div className="form-row" style={{ justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--on-surface-variant)' }}>
                      Offers ({offers.length})
                    </span>
                    <span className="fare-badge" title={`${selectedRequest.fare} CLT`}>{formatUsd(selectedRequest.fare)}</span>
                  </div>
                  {offersLoading ? (
                    <p style={{ fontSize: '0.8rem', color: 'var(--on-surface-variant)', margin: 0 }}>Loading...</p>
                  ) : offers.length === 0 ? (
                    <p style={{ fontSize: '0.8rem', color: 'var(--on-surface-variant)', margin: 0 }}>No offers yet.</p>
                  ) : (
                    offers.map((offer) => (
                      <div key={offer.txHash} className="offer-row offer-row--driver">
                        <div className="offer-row-driver" style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '1rem' }}>
                          <div className="offer-avatar" style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary-container), var(--primary-dim))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Icon name="directions_car" size={20} fill={1} className="text-on-primary-fixed" />
                          </div>
                          <div>
                            <p style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--on-surface)', margin: 0 }}>{truncAddr(offer.driverAddress)}</p>
                            <p style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--on-surface-variant)', margin: '0.15rem 0 0 0' }}>Driver</p>
                          </div>
                        </div>
                        <div>
                          <p style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--on-surface)', margin: 0 }} title={`${offer.fare} CLT`}>{formatUsd(offer.fare)}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}

      {activeTab === 'trips' && (
        <>
          {activeTripsError && <div className="status-banner error">{activeTripsError}</div>}

          {activeTrips.length === 0 && !activeTripsLoading && !activeTripsError && (
            <EmptyState message="No active trips on the network." />
          )}

          {activeTrips.map((trip) => <ActiveTripCard key={trip.txHash} trip={trip} />)}
        </>
      )}

      {activeTab === 'recent' && (
        <>
          {recentTripsError && <div className="status-banner error">{recentTripsError}</div>}

          {recentTrips.length === 0 && !recentTripsLoading && !recentTripsError && (
            <EmptyState message="No recent rides on the network yet. Trips appear here when fully paid or cancelled." />
          )}

          {recentTrips.map((trip) => (
            <CompletedTripCard key={trip.txHash} trip={trip} />
          ))}
        </>
      )}

    </div>
  );
};

export default NetworkView;
