import React, { useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import MapFitBounds from './MapFitBounds';
import { MAP_ATTRIBUTION, MAP_TILE_URL } from '../config';
import { truncAddr } from '../utils/address';
import { formatUsd } from '../utils/money';
import { pickupIcon, dropoffIcon } from '../utils/mapMarkers';
import MapLegend from './MapLegend';

function CopyableAddress({ address }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };
  return (
    <span
      className="truncate-address"
      onClick={handleCopy}
      title={address}
      style={{ cursor: 'pointer' }}
    >
      {copied ? 'Copied!' : truncAddr(address)}
    </span>
  );
}

/** Read-only card for recent ride history (completed or cancelled). */
const CompletedTripCard = ({ trip }) => {
  const farePaid = BigInt(trip.farePaid ?? trip.fare_paid ?? 0);
  const totalFare = BigInt(trip.fare);
  const rawStatus = (trip.tripStatus ?? trip.trip_status ?? 'completed').toLowerCase();
  const isCancelled = rawStatus === 'cancelled';

  const pickup = [trip.pickupLocation.latitude, trip.pickupLocation.longitude];
  const dropoff = [trip.dropoffLocation.latitude, trip.dropoffLocation.longitude];

  const statusLabel = isCancelled ? 'Cancelled' : 'Completed';
  const statusClass = isCancelled ? 'status-dot--warn' : 'status-dot--done';
  const lineColor = isCancelled ? 'var(--warning, #f59e0b)' : 'var(--success)';
  const progressPct =
    totalFare > 0n
      ? Math.min(100, Number((farePaid * 100n) / totalFare))
      : isCancelled ? 0 : 100;

  return (
    <div className="card active-trip-card completed-trip-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.875rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <span className="trip-status">
          <span className={`status-dot ${statusClass}`} />
          {statusLabel}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
          <span className="fare-badge" title={`${totalFare} CLT`}>
            {isCancelled ? `${formatUsd(totalFare)} offer` : `${formatUsd(totalFare)} paid`}
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {formatUsd(farePaid)} settled
            {isCancelled && ' · trip cancelled'}
          </span>
        </div>
      </div>

      <div
        className="trip-progress-bar"
        style={{
          height: 6,
          borderRadius: 4,
          background: 'var(--surface-container-low)',
          marginBottom: '0.875rem',
          overflow: 'hidden',
        }}
      >
        <div
          className="trip-progress-fill"
          style={{
            height: '100%',
            width: `${progressPct}%`,
            background: isCancelled ? lineColor : 'linear-gradient(90deg, var(--primary-dim), var(--primary), var(--tertiary))',
            transition: 'width 0.3s ease',
          }}
        />
      </div>

      <div className="map-wrapper" style={{ marginBottom: '1rem' }}>
        <MapLegend style={{ position: 'absolute', top: '0.5rem', left: '0.5rem', zIndex: 700 }} />
        <MapContainer center={pickup} zoom={13} style={{ height: 'clamp(120px, 18vh, 160px)', width: '100%' }}>
          <TileLayer url={MAP_TILE_URL} attribution={MAP_ATTRIBUTION} />
          <MapFitBounds positions={[pickup, dropoff]} />
          <Marker position={pickup} icon={pickupIcon}><Popup>Pickup</Popup></Marker>
          <Marker position={dropoff} icon={dropoffIcon}><Popup>Dropoff</Popup></Marker>
          <Polyline positions={[pickup, dropoff]} color={lineColor} weight={3} opacity={0.75} />
        </MapContainer>
      </div>

      <div className="trip-details-grid">
        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
          <div>Driver: <CopyableAddress address={trip.driverAddress} /></div>
          <div>Passenger: <CopyableAddress address={trip.passengerAddress} /></div>
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'right', lineHeight: 1.8 }}>
          <div title={trip.txHash}>Acceptance: <CopyableAddress address={trip.txHash} /></div>
          <div title={trip.rideOfferTxHash}>Offer: <CopyableAddress address={trip.rideOfferTxHash} /></div>
        </div>
      </div>
    </div>
  );
};

export default CompletedTripCard;
