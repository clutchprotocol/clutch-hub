import React, { useState, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import MapFitBounds from './MapFitBounds';
import { ClutchHubSdk, verifyUnsignedTransaction } from 'clutch-hub-sdk-js';
import { API_URL, CHAIN_ID, MAP_ATTRIBUTION, MAP_TILE_URL } from '../config';
import TransactionHistory from './TransactionHistory';
import { usePrivateKeyRequest } from './layout/usePrivateKeyRequest.jsx';
import { useConfirmDialog } from './layout/useConfirmDialog.jsx';
import { truncAddr } from '../utils/address';
import { formatUsd, parseUsdToClt } from '../utils/money';
import { pickupIcon, dropoffIcon } from '../utils/mapMarkers';
import MapLegend from './MapLegend';

function normAddr(a) {
  if (!a) return '';
  const s = String(a).trim().toLowerCase();
  return s.startsWith('0x') ? s : `0x${s}`;
}

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

const ActiveTripCard = ({ trip, passengerPayment, cancelAction }) => {
  const farePaid = BigInt(trip.farePaid ?? trip.fare_paid ?? 0);
  const totalFare = BigInt(trip.fare);
  const remaining = totalFare > farePaid ? totalFare - farePaid : 0n;

  const [payAmount, setPayAmount] = useState('');
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState(null);
  const [referrer, setReferrer] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState(null);

  const { PrivateKeyModal, requestPrivateKey } = usePrivateKeyRequest();
  const { ConfirmModal, requestConfirm } = useConfirmDialog();

  const showPayUi =
    passengerPayment?.userProfile?.publicKey &&
    normAddr(passengerPayment.userProfile.publicKey) === normAddr(trip.passengerAddress) &&
    remaining > 0n;

  const canCancel =
    cancelAction?.userProfile?.publicKey &&
    remaining > 0n &&
    (normAddr(cancelAction.userProfile.publicKey) === normAddr(trip.passengerAddress) ||
      normAddr(cancelAction.userProfile.publicKey) === normAddr(trip.driverAddress));

  const handlePay = useCallback(async () => {
    if (!passengerPayment?.userProfile?.publicKey) return;
    let fare;
    try {
      fare = parseUsdToClt(payAmount);
    } catch {
      setPayError('Enter a positive amount.');
      return;
    }
    if (fare <= 0n) {
      setPayError('Enter a positive amount.');
      return;
    }
    if (fare > remaining) {
      setPayError(`Amount cannot exceed remaining ${formatUsd(remaining)}.`);
      return;
    }
    setPaying(true);
    setPayError(null);
    setReferrer(null);
    try {
      const { publicKey, privateKey } = passengerPayment.userProfile;
      // Private key needed before createUnsigned*: generateToken requires a signed challenge.
      let pk = privateKey;
      if (!pk) {
        pk = await requestPrivateKey('Enter your private key to sign the payment:');
        if (!pk) {
          setPayError('Signing cancelled.');
          setPaying(false);
          return;
        }
      }
      const sdk = new ClutchHubSdk(API_URL, publicKey, pk, CHAIN_ID);
      const unsignedTx = await sdk.createUnsignedRidePay({
        rideAcceptanceTxHash: trip.txHash,
        fare,
      });
      const expected = { type: 'RidePay', fare, refTxHash: trip.txHash };
      setReferrer(verifyUnsignedTransaction(unsignedTx, expected).referrer);
      const signature = await sdk.signTransaction(unsignedTx, pk, expected);
      await sdk.submitTransaction(signature.rawTransaction);
      TransactionHistory.addTransaction(publicKey, {
        type: 'Ride Pay',
        timestamp: Date.now(),
        fare: fare.toString(),
        status: 'success',
        txHash: signature.txHash || '',
      });
      setPayAmount('');
      passengerPayment.onSuccess?.();
    } catch (err) {
      console.error(err);
      setPayError(err.message || 'Payment failed');
      TransactionHistory.addTransaction(passengerPayment.userProfile.publicKey, {
        type: 'Ride Pay',
        timestamp: Date.now(),
        fare: fare.toString(),
        status: 'failed',
        error: err.message,
      });
    } finally {
      setPaying(false);
    }
  }, [passengerPayment, payAmount, remaining, trip.txHash, requestPrivateKey]);

  /** @param {bigint} numerator @param {bigint} denominator */
  const setQuickPay = (numerator, denominator) => {
    const v = (remaining * numerator) / denominator;
    const clamped = (v > 0n ? v : 1n) < remaining ? (v > 0n ? v : 1n) : remaining;
    setPayAmount(formatUsd(clamped).slice(1));
  };

  const handleCancel = useCallback(async () => {
    if (!cancelAction?.userProfile?.publicKey || remaining <= 0n) return;
    const ok = await requestConfirm({
      title: 'Cancel this ride?',
      desc: 'Unpaid fare will be refunded to the passenger.',
      confirmText: 'Cancel ride',
      cancelText: 'Keep ride',
    });
    if (!ok) return;
    setCancelling(true);
    setCancelError(null);
    try {
      const { publicKey, privateKey } = cancelAction.userProfile;
      // Private key needed before createUnsigned*: generateToken requires a signed challenge.
      let pk = privateKey;
      if (!pk) {
        pk = await requestPrivateKey('Enter your private key to sign the cancellation:');
        if (!pk) {
          setCancelError('Signing cancelled.');
          setCancelling(false);
          return;
        }
      }
      const sdk = new ClutchHubSdk(API_URL, publicKey, pk, CHAIN_ID);
      const unsignedTx = await sdk.createUnsignedRideCancel({
        rideAcceptanceTxHash: trip.txHash,
      });
      const expected = { type: 'RideCancel', refTxHash: trip.txHash };
      const signature = await sdk.signTransaction(unsignedTx, pk, expected);
      await sdk.submitTransaction(signature.rawTransaction);
      TransactionHistory.addTransaction(publicKey, {
        type: 'Ride Cancel',
        timestamp: Date.now(),
        status: 'success',
        txHash: signature.txHash || '',
      });
      cancelAction.onSuccess?.();
    } catch (err) {
      console.error(err);
      setCancelError(err.message || 'Cancel failed');
      TransactionHistory.addTransaction(cancelAction.userProfile.publicKey, {
        type: 'Ride Cancel',
        timestamp: Date.now(),
        status: 'failed',
        error: err.message,
      });
    } finally {
      setCancelling(false);
    }
  }, [cancelAction, remaining, trip.txHash, requestPrivateKey, requestConfirm]);

  const puLat = trip.pickupLocation.latitude;
  const puLng = trip.pickupLocation.longitude;
  const doLat = trip.dropoffLocation.latitude;
  const doLng = trip.dropoffLocation.longitude;

  const pickup = [puLat, puLng];
  const dropoff = [doLat, doLng];

  return (
    <div className="card active-trip-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.875rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <span className="trip-status">
          <span className="status-dot status-dot--live" />
          In Progress
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
          <span className="fare-badge" title={`${totalFare} CLT`}>{formatUsd(totalFare)} total</span>
          {farePaid > 0n && (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Paid {formatUsd(farePaid)}
              {remaining > 0n ? ` · ${formatUsd(remaining)} left` : ''}
            </span>
          )}
        </div>
      </div>

      {remaining > 0n && (
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
              width: `${totalFare > 0n ? Number((farePaid * 100n) / totalFare) : 0}%`,
              background: 'linear-gradient(90deg, var(--primary-dim), var(--primary), var(--tertiary))',
              transition: 'width 0.3s ease',
            }}
          />
        </div>
      )}

      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0 0 0.875rem 0', lineHeight: 1.5 }}>
        Route: pickup {puLat.toFixed(4)}, {puLng.toFixed(4)} → dropoff {doLat.toFixed(4)}, {doLng.toFixed(4)}
      </p>

      <div className="map-wrapper" style={{ marginBottom: '1rem' }}>
        <MapLegend style={{ position: 'absolute', top: '0.5rem', left: '0.5rem', zIndex: 700 }} />
        <MapContainer center={pickup} zoom={13} style={{ height: 'clamp(120px, 18vh, 160px)', width: '100%' }}>
          <TileLayer url={MAP_TILE_URL} attribution={MAP_ATTRIBUTION} />
          <MapFitBounds positions={[pickup, dropoff]} />
          <Marker position={pickup} icon={pickupIcon}>
            <Popup>Pickup</Popup>
          </Marker>
          <Marker position={dropoff} icon={dropoffIcon}>
            <Popup>Dropoff</Popup>
          </Marker>
          <Polyline positions={[pickup, dropoff]} color="var(--accent)" weight={3} opacity={0.85} />
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

      {showPayUi && (
        <div style={{ marginTop: '1rem', paddingTop: '1rem' }}>
          <p className="card-title" style={{ marginBottom: '0.5rem' }}>Pay driver (partial OK)</p>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 0.75rem 0' }}>
            Pay in portions as the ride progresses. Up to <strong>{formatUsd(remaining)}</strong> remaining.
          </p>
          <div className="form-row" style={{ marginBottom: '0.5rem', flexWrap: 'wrap' }}>
            <input
              type="text"
              inputMode="decimal"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              className="input-field"
              style={{ width: 120 }}
              placeholder="Amount ($)"
            />
            <button type="button" className="btn-secondary" style={{ fontSize: '0.75rem' }} onClick={() => setQuickPay(25n, 100n)}>
              25%
            </button>
            <button type="button" className="btn-secondary" style={{ fontSize: '0.75rem' }} onClick={() => setQuickPay(50n, 100n)}>
              50%
            </button>
            <button type="button" className="btn-secondary" style={{ fontSize: '0.75rem' }} onClick={() => setPayAmount(formatUsd(remaining).slice(1))}>
              Remaining
            </button>
            <button
              type="button"
              className="btn-primary"
              style={{ fontSize: '0.8rem' }}
              disabled={paying || !payAmount}
              onClick={handlePay}
            >
              {paying ? 'Paying…' : 'Pay'}
            </button>
          </div>
          {referrer && (
            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '0 0 0.5rem 0' }}>
              Referrer on this transaction: <CopyableAddress address={referrer} />
            </p>
          )}
          {payError && <div className="status-banner error" style={{ padding: '0.5rem', fontSize: '0.8rem' }}>{payError}</div>}
        </div>
      )}

      {!showPayUi && remaining > 0n && (
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.75rem 0 0 0' }}>
          {farePaid > 0n ? `Passenger has paid ${formatUsd(farePaid)} / ${formatUsd(totalFare)}.` : 'Awaiting passenger payment.'}
        </p>
      )}

      {canCancel && (
        <div style={{ marginTop: '1rem', paddingTop: '1rem' }}>
          <button
            type="button"
            className="btn-secondary"
            style={{ fontSize: '0.8rem', color: 'var(--error)' }}
            disabled={cancelling}
            onClick={handleCancel}
          >
            {cancelling ? 'Cancelling…' : 'Cancel ride'}
          </button>
          {cancelError && <div className="status-banner error" style={{ padding: '0.5rem', fontSize: '0.8rem', marginTop: '0.5rem' }}>{cancelError}</div>}
        </div>
      )}
      <ConfirmModal />
      <PrivateKeyModal />
    </div>
  );
};

export default ActiveTripCard;
