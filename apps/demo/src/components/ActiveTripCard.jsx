import React, { useState, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import MapFitBounds from './MapFitBounds';
import RouteLine from './RouteLine';
import { Receipt, Row, Rule, Meter, CopyableAddress } from './receipt';
import { ClutchHubSdk, verifyUnsignedTransaction } from 'clutch-hub-sdk-js';
import { API_URL, CHAIN_ID, MAP_ATTRIBUTION, MAP_TILE_URL } from '../config';
import TransactionHistory from './TransactionHistory';
import WalletNote from './WalletNote';
import { useConfirmDialog } from './layout/useConfirmDialog.jsx';
import { formatUsd, parseUsdToClt } from '../utils/money';
import { approveInWalletMessage, describeWalletError } from '../utils/walletSession';
import { pickupIcon, dropoffIcon } from '../utils/mapMarkers';

function normAddr(a) {
  if (!a) return '';
  const s = String(a).trim().toLowerCase();
  return s.startsWith('0x') ? s : `0x${s}`;
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
  // What the wallet's prompt is for, while one is open.
  const [walletNote, setWalletNote] = useState('');

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
      const { publicKey, signer } = passengerPayment.userProfile;
      const sdk = new ClutchHubSdk(API_URL, publicKey, signer, CHAIN_ID);
      // The wallet asks to sign in first when it has not yet (generateToken needs a signed
      // challenge), then asks for the payment itself.
      const what = `pay ${formatUsd(fare)} for this ride`;
      setWalletNote(approveInWalletMessage(what, sdk.hasValidToken()));
      const unsignedTx = await sdk.createUnsignedRidePay({
        rideAcceptanceTxHash: trip.txHash,
        fare,
      });
      const expected = { type: 'RidePay', fare, refTxHash: trip.txHash };
      setReferrer(verifyUnsignedTransaction(unsignedTx, expected).referrer);
      setWalletNote(approveInWalletMessage(what));
      const signature = await sdk.signTransaction(unsignedTx, signer, expected);
      setWalletNote('');
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
      setPayError(describeWalletError(err, 'Payment failed'));
      TransactionHistory.addTransaction(passengerPayment.userProfile.publicKey, {
        type: 'Ride Pay',
        timestamp: Date.now(),
        fare: fare.toString(),
        status: 'failed',
        error: err.message,
      });
    } finally {
      setPaying(false);
      setWalletNote('');
    }
  }, [passengerPayment, payAmount, remaining, trip.txHash]);

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
      const { publicKey, signer } = cancelAction.userProfile;
      const sdk = new ClutchHubSdk(API_URL, publicKey, signer, CHAIN_ID);
      const what = 'cancel this ride';
      setWalletNote(approveInWalletMessage(what, sdk.hasValidToken()));
      const unsignedTx = await sdk.createUnsignedRideCancel({
        rideAcceptanceTxHash: trip.txHash,
      });
      const expected = { type: 'RideCancel', refTxHash: trip.txHash };
      setWalletNote(approveInWalletMessage(what));
      const signature = await sdk.signTransaction(unsignedTx, signer, expected);
      setWalletNote('');
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
      setCancelError(describeWalletError(err, 'Cancel failed'));
      TransactionHistory.addTransaction(cancelAction.userProfile.publicKey, {
        type: 'Ride Cancel',
        timestamp: Date.now(),
        status: 'failed',
        error: err.message,
      });
    } finally {
      setCancelling(false);
      setWalletNote('');
    }
  }, [cancelAction, remaining, trip.txHash, requestConfirm]);

  const puLat = trip.pickupLocation.latitude;
  const puLng = trip.pickupLocation.longitude;
  const doLat = trip.dropoffLocation.latitude;
  const doLng = trip.dropoffLocation.longitude;

  const pickup = [puLat, puLng];
  const dropoff = [doLat, doLng];

  return (
    <>
      <Receipt title="Trip receipt" status="In progress" tone="live">
        <Rule />
        <div className="map-wrapper receipt-map">
          <MapContainer center={pickup} zoom={13} style={{ height: 'clamp(120px, 18vh, 160px)', width: '100%' }}>
            <TileLayer url={MAP_TILE_URL} attribution={MAP_ATTRIBUTION} />
            <MapFitBounds positions={[pickup, dropoff]} />
            <RouteLine positions={[pickup, dropoff]} />
            <Marker position={pickup} icon={pickupIcon}>
              <Popup>Pickup</Popup>
            </Marker>
            <Marker position={dropoff} icon={dropoffIcon}>
              <Popup>Dropoff</Popup>
            </Marker>
          </MapContainer>
        </div>
        <Row label="Pickup">{Number(puLat).toFixed(4)}, {Number(puLng).toFixed(4)}</Row>
        <Row label="Drop-off">{Number(doLat).toFixed(4)}, {Number(doLng).toFixed(4)}</Row>
        <Row label="Driver"><CopyableAddress address={trip.driverAddress} /></Row>
        <Row label="Passenger"><CopyableAddress address={trip.passengerAddress} /></Row>
        <Rule />
        <Row label="Fare" total>{formatUsd(totalFare)}</Row>
        <Row label="Paid" print>{formatUsd(farePaid)}</Row>
        <Row label="Left">{formatUsd(remaining)}</Row>
        <Meter paid={farePaid} total={totalFare} />

        {showPayUi && (
          <>
            <Rule />
            <h4 className="r-title">Pay driver</h4>
            <p className="r-text">
              Pay in portions as the ride goes. Up to <strong>{formatUsd(remaining)}</strong> left.
            </p>
            <div className="r-actions">
              <input
                type="text"
                inputMode="decimal"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="input-field r-amount"
                placeholder="Amount ($)"
                aria-label="Amount to pay in dollars"
              />
              <button type="button" className="btn-secondary" onClick={() => setQuickPay(25n, 100n)}>
                25%
              </button>
              <button type="button" className="btn-secondary" onClick={() => setQuickPay(50n, 100n)}>
                50%
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setPayAmount(formatUsd(remaining).slice(1))}
              >
                Remaining
              </button>
              <button
                type="button"
                className="btn-primary r-go"
                disabled={paying || !payAmount}
                onClick={handlePay}
              >
                {paying ? 'Paying…' : 'Pay'}
              </button>
            </div>
            <WalletNote message={paying ? walletNote : ''} />
            {referrer && (
              <p className="r-note">
                Referrer on this transaction: <CopyableAddress address={referrer} />
              </p>
            )}
            {payError && <div className="status-banner error">{payError}</div>}
          </>
        )}

        {!showPayUi && remaining > 0n && (
          <>
            <Rule />
            <p className="r-text">
              {farePaid > 0n
                ? `Passenger has paid ${formatUsd(farePaid)} / ${formatUsd(totalFare)}.`
                : 'Awaiting passenger payment.'}
            </p>
          </>
        )}

        <Rule />
        <Row label="Acceptance"><CopyableAddress address={trip.txHash} /></Row>
        <Row label="Offer"><CopyableAddress address={trip.rideOfferTxHash} /></Row>

        {canCancel && (
          <>
            <Rule />
            <button type="button" className="btn-danger" disabled={cancelling} onClick={handleCancel}>
              {cancelling ? 'Cancelling…' : 'Cancel ride'}
            </button>
            <WalletNote message={cancelling ? walletNote : ''} />
            {cancelError && (
              <div className="status-banner error" style={{ marginTop: '0.5rem' }}>{cancelError}</div>
            )}
          </>
        )}
      </Receipt>
      <ConfirmModal />
    </>
  );
};

export default ActiveTripCard;
