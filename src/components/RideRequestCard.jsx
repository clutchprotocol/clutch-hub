import { useState, useCallback, useEffect } from 'react';
import { ClutchHubSdk } from 'clutch-hub-sdk-js';
import { API_URL, CHAIN_ID } from '../config';
import { truncAddr } from '../utils/address';
import { formatUsd } from '../utils/money';
import { subscribeRideOffersCompat } from '../sdkRealtime';
import TransactionHistory from './TransactionHistory';

// One open ride request, with the offers drivers have made against it. Owns its own offer
// state and subscription: the passenger can have several requests open at once, and each
// card's offers arrive independently.

const RideRequestCard = ({
  req,
  userProfile,
  hubSdk,
  onAcceptSuccess,
  onCancelSuccess,
  requestPrivateKey,
}) => {
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [acceptingOfferTxHash, setAcceptingOfferTxHash] = useState(null);
  const [acceptError, setAcceptError] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState(null);

  const fetchOffers = useCallback(async () => {
    if (!userProfile.publicKey || !req.txHash) return;
    setLoading(true);
    setError(null);
    try {
      const sdk = hubSdk ?? new ClutchHubSdk(API_URL, userProfile.publicKey, undefined, CHAIN_ID);
      const fetchedOffers = await sdk.listRideOffers(req.txHash);
      setOffers(fetchedOffers);
    } catch (err) {
      console.error('Failed to fetch offers:', err);
      setError(err.message || 'Failed to load offers');
    } finally {
      setLoading(false);
    }
  }, [req.txHash, userProfile.publicKey, hubSdk]);

  useEffect(() => {
    if (!userProfile.publicKey || !req.txHash) return undefined;
    setLoading(true);
    setError(null);
    const sdk = hubSdk ?? new ClutchHubSdk(API_URL, userProfile.publicKey, undefined, CHAIN_ID);
    const dispose = subscribeRideOffersCompat(sdk, req.txHash, {
      onData: (list) => {
        setOffers(list);
        setLoading(false);
      },
      onError: (err) => {
        console.error('Offers subscription error:', err);
        setError(err.message || 'Failed to load offers');
        setLoading(false);
      },
    });
    return () => dispose();
  }, [req.txHash, userProfile.publicKey, hubSdk]);

  const handleAcceptOffer = useCallback(async (offer) => {
    if (!userProfile.publicKey || !offer.txHash) return;
    setAcceptingOfferTxHash(offer.txHash);
    setAcceptError(null);
    try {
      // Private key needed before createUnsigned*: generateToken requires a signed challenge.
      let privateKey = userProfile.privateKey;
      if (!privateKey) {
        privateKey = await requestPrivateKey('Enter your private key to sign the acceptance:');
        if (!privateKey) {
          setAcceptError('Signing cancelled.');
          setAcceptingOfferTxHash(null);
          return;
        }
      }
      const sdk = hubSdk ?? new ClutchHubSdk(API_URL, userProfile.publicKey, privateKey, CHAIN_ID);
      sdk.setPrivateKey(privateKey);
      const unsignedTx = await sdk.createUnsignedRideAcceptance({ rideOfferTxHash: offer.txHash });
      const signature = await sdk.signTransaction(unsignedTx, privateKey, {
        type: 'RideAcceptance',
        refTxHash: offer.txHash,
      });
      await sdk.submitTransaction(signature.rawTransaction);
      TransactionHistory.addTransaction(userProfile.publicKey, {
        type: 'Ride Acceptance',
        timestamp: Date.now(),
        rideOfferTxHash: offer.txHash,
        status: 'success',
        txHash: signature.txHash || '',
      });
      onAcceptSuccess?.();
    } catch (err) {
      console.error('Accept offer failed:', err);
      setAcceptError(err.message || 'Failed to accept offer');
      TransactionHistory.addTransaction(userProfile.publicKey, {
        type: 'Ride Acceptance',
        timestamp: Date.now(),
        rideOfferTxHash: offer.txHash,
        status: 'failed',
        error: err.message,
      });
    } finally {
      setAcceptingOfferTxHash(null);
    }
  }, [userProfile, onAcceptSuccess, requestPrivateKey, hubSdk]);

  const handleCancelRequest = useCallback(async () => {
    if (!userProfile.publicKey || !req.txHash) return;
    setCancelling(true);
    setCancelError(null);
    try {
      // Private key needed before createUnsigned*: generateToken requires a signed challenge.
      let privateKey = userProfile.privateKey;
      if (!privateKey) {
        privateKey = await requestPrivateKey('Enter your private key to sign the cancellation:');
        if (!privateKey) {
          setCancelError('Signing cancelled.');
          setCancelling(false);
          return;
        }
      }
      const sdk = hubSdk ?? new ClutchHubSdk(API_URL, userProfile.publicKey, privateKey, CHAIN_ID);
      sdk.setPrivateKey(privateKey);
      const unsignedTx = await sdk.createUnsignedRideRequestCancel({ rideRequestTxHash: req.txHash });
      const signature = await sdk.signTransaction(unsignedTx, privateKey, {
        type: 'RideRequestCancel',
        refTxHash: req.txHash,
      });
      await sdk.submitTransaction(signature.rawTransaction);
      TransactionHistory.addTransaction(userProfile.publicKey, {
        type: 'Ride Request Cancel',
        timestamp: Date.now(),
        rideRequestTxHash: req.txHash,
        status: 'success',
        txHash: signature.txHash || '',
      });
      onCancelSuccess?.();
    } catch (err) {
      console.error('Cancel request failed:', err);
      setCancelError(err.message || 'Failed to cancel request');
      TransactionHistory.addTransaction(userProfile.publicKey, {
        type: 'Ride Request Cancel',
        timestamp: Date.now(),
        rideRequestTxHash: req.txHash,
        status: 'failed',
        error: err.message,
      });
    } finally {
      setCancelling(false);
    }
  }, [userProfile, req.txHash, onCancelSuccess, requestPrivateKey, hubSdk]);

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div className="form-row" style={{ justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{new Date(req.timestamp).toLocaleString()}</span>
        <span className="fare-badge" title={`${req.fare} CLT`}>{formatUsd(req.fare)}</span>
      </div>

      <div>
        <div className="form-row" style={{ justifyContent: 'space-between', marginBottom: '0.625rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Offers ({offers.length})</span>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button type="button" className="btn-ghost" onClick={fetchOffers} disabled={loading} style={{ fontSize: '0.75rem' }}>
              {loading ? '...' : 'Refresh'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              style={{ fontSize: '0.75rem' }}
              onClick={handleCancelRequest}
              disabled={cancelling}
            >
              {cancelling ? 'Cancelling...' : 'Cancel request'}
            </button>
          </div>
        </div>

        {error && <div className="status-banner error" style={{ padding: '0.5rem', fontSize: '0.8rem', marginBottom: '0.5rem' }}>{error}</div>}
        {cancelError && <div className="status-banner error" style={{ padding: '0.5rem', fontSize: '0.8rem', marginBottom: '0.5rem' }}>{cancelError}</div>}
        {acceptError && <div className="status-banner error" style={{ padding: '0.5rem', fontSize: '0.8rem', marginBottom: '0.5rem' }}>{acceptError}</div>}

        {offers.length === 0 && !loading && !error && (
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>No offers yet.</p>
        )}

        {/*
          Readiness item H1. Accepting is the moment the whole fare leaves the passenger and is
          held for the trip, and it is the moment the passenger gives up the recourse a card
          network would have provided. Neither of those was stated anywhere.
          Shown with the offers rather than in a modal: for play money, a dialog demanding
          acknowledgement of "you have no recourse" is theatre, and it trains people to click
          through exactly the dialog that would matter on a real deployment. A real deployment
          needs acknowledgement rather than display — see the readiness doc.
        */}
        {offers.length > 0 && (
          <div
            className="status-banner info"
            role="note"
            style={{ padding: '0.5rem 0.6rem', fontSize: '0.75rem', marginBottom: '0.5rem', textAlign: 'left', lineHeight: 1.5 }}
          >
            Accepting holds the full fare on chain straight away. You sign the payment yourself, so
            there is no card issuer to reverse it and <strong>no arbitration if you and the driver
            disagree</strong> — dispute resolution is not built yet. Either side can cancel before
            the fare is fully paid, and the unpaid part returns to you.
          </div>
        )}

        {offers.map((offer) => (
          <div key={offer.txHash} className="offer-row offer-row--driver">
            <div className="offer-row-driver">
              <div className="offer-avatar" aria-hidden>🚗</div>
              <div className="offer-row-driver-meta">
                <p className="offer-row-driver-address">{truncAddr(offer.driverAddress)}</p>
                <p className="offer-row-driver-label">Driver</p>
              </div>
            </div>
            <div className="offer-row-actions">
              <div className="offer-row-price" title={`${offer.fare} CLT`}>{formatUsd(offer.fare)}</div>
              <button
                type="button"
                className="btn-primary"
                style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem', flexShrink: 0, marginTop: '0.35rem' }}
                onClick={() => handleAcceptOffer(offer)}
                disabled={!!acceptingOfferTxHash}
              >
                {acceptingOfferTxHash === offer.txHash ? 'Accepting...' : 'Accept'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RideRequestCard;
