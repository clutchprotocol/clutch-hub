import React, { useState, useCallback, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import MapFitBounds from './MapFitBounds';
import ActiveTripCard from './ActiveTripCard';
import CompletedTripCard from './CompletedTripCard';
import { BottomSheet, OverlayPanel, Toast, EmptyState } from './layout';
import L from 'leaflet';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';
import { ClutchHubSdk, verifyUnsignedTransaction } from 'clutch-hub-sdk-js';
import { API_URL, CHAIN_ID, MAP_ATTRIBUTION, MAP_TILE_URL } from '../config';
import { useClutchSdk } from '../hooks/useClutchSdk';
import { truncAddr } from '../utils/address';
import { formatUsd, parseUsdToClt } from '../utils/money';
import {
  subscribeActiveTripsCompat,
  subscribeRecentTripsCompat,
  subscribeRideOffersCompat,
  subscribeRideRequestsCompat,
} from '../sdkRealtime';
import TransactionHistory from './TransactionHistory';
import { usePrivateKeyRequest } from './layout/usePrivateKeyRequest.jsx';
import { pickupIcon, dropoffIcon } from '../utils/mapMarkers';
import MapLegend from './MapLegend';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

const RequestDetail = ({
  req,
  userProfile,
  hubSdk,
  offerFares,
  handleFareChange,
  handleAcceptOffer,
  acceptingTxHash,
  offerReferrer,
  disabled,
  onBack,
}) => {
  const [offers, setOffers] = useState([]);
  const [loadingOffers, setLoadingOffers] = useState(false);
  const [offersError, setOffersError] = useState(null);

  const fetchOffers = useCallback(async () => {
    if (!req.txHash) return;
    setLoadingOffers(true);
    setOffersError(null);
    try {
      const sdk = hubSdk ?? new ClutchHubSdk(API_URL, userProfile.publicKey || '0x0', undefined, CHAIN_ID);
      const fetchedOffers = await sdk.listRideOffers(req.txHash);
      setOffers(fetchedOffers);
    } catch (err) {
      console.error('Failed to fetch offers:', err);
      setOffersError(err.message || 'Failed to load offers');
    } finally {
      setLoadingOffers(false);
    }
  }, [req.txHash, userProfile.publicKey, hubSdk]);

  useEffect(() => {
    if (!req.txHash) return undefined;
    setLoadingOffers(true);
    setOffersError(null);
    const sdk = hubSdk ?? new ClutchHubSdk(API_URL, userProfile.publicKey || '0x0', undefined, CHAIN_ID);
    const dispose = subscribeRideOffersCompat(sdk, req.txHash, {
      onData: (list) => {
        setOffers(list);
        setLoadingOffers(false);
      },
      onError: (err) => {
        console.error('Offers subscription error:', err);
        setOffersError(err.message || 'Failed to load offers');
        setLoadingOffers(false);
      },
    });
    return () => dispose();
  }, [req.txHash, userProfile.publicKey, hubSdk]);

  return (
    <div>
      <button type="button" className="sheet-back-btn" onClick={onBack}>← All requests</button>
      <div className="form-row" style={{ justifyContent: 'space-between', margin: '0.5rem 0 0.875rem' }}>
        <span className="truncate-address" title={req.passengerAddress}>
          Passenger: {truncAddr(req.passengerAddress)}
        </span>
        <span className="fare-badge" title={`${req.fare} CLT`}>{formatUsd(req.fare)}</span>
      </div>

      <div style={{ marginBottom: '0.875rem' }}>
        <div className="form-row" style={{ justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--on-surface-variant)' }}>Offers ({offers.length})</span>
          <button type="button" className="btn-ghost" onClick={fetchOffers} disabled={loadingOffers} style={{ fontSize: '0.75rem' }}>
            {loadingOffers ? '...' : 'Refresh'}
          </button>
        </div>
        {offersError && <div className="status-banner error" style={{ padding: '0.5rem', fontSize: '0.8rem', marginBottom: '0.5rem' }}>{offersError}</div>}
        {offers.length === 0 && !loadingOffers && !offersError && (
          <p style={{ fontSize: '0.8rem', color: 'var(--on-surface-variant)', margin: 0 }}>No offers yet.</p>
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
            <div className="offer-row-price" title={`${offer.fare} CLT`}>{formatUsd(offer.fare)}</div>
          </div>
        ))}
      </div>

      <div>
        <div className="form-row">
          <label className="label" style={{ margin: 0, whiteSpace: 'nowrap' }}>Your offer</label>
          <input
            type="text"
            inputMode="decimal"
            value={offerFares[req.txHash] !== undefined ? offerFares[req.txHash] : formatUsd(req.fare).slice(1)}
            onChange={(e) => handleFareChange(req.txHash, e.target.value)}
            className="input-field"
            style={{ width: 100, padding: '0.4rem 0.5rem', fontSize: '0.85rem' }}
            disabled={disabled || acceptingTxHash === req.txHash}
          />
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>$</span>
          <button
            type="button"
            className="btn-primary"
            style={{ marginLeft: 'auto', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
            disabled={disabled || !!acceptingTxHash || !userProfile.publicKey}
            onClick={() => handleAcceptOffer(req)}
          >
            {acceptingTxHash === req.txHash ? 'Submitting...' : disabled ? 'Finish trip first' : userProfile.publicKey ? 'Make Offer' : 'Connect wallet'}
          </button>
        </div>
        {acceptingTxHash === req.txHash && offerReferrer && (
          <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '0.5rem 0 0 0' }}>
            Referrer on this offer: {offerReferrer}
          </p>
        )}
      </div>
    </div>
  );
};

const DriverView = ({ userProfile, externalTab, onTabSync }) => {
  const [, setRefreshBalanceCounter] = useState(0);
  const [rideRequests, setRideRequests] = useState([]);
  const [isLoadingRides, setIsLoadingRides] = useState(false);
  const [ridesError, setRidesError] = useState(null);
  const [acceptingTxHash, setAcceptingTxHash] = useState(null);
  const [acceptStatus, setAcceptStatus] = useState(null);
  const [offerFares, setOfferFares] = useState({});
  const [activeTrips, setActiveTrips] = useState([]);
  const [, setActiveTripsLoading] = useState(false);
  const [activeTripsError, setActiveTripsError] = useState(null);
  const [recentTrips, setRecentTrips] = useState([]);
  const [recentTripsLoading, setRecentTripsLoading] = useState(false);
  const [recentTripsError, setRecentTripsError] = useState(null);
  const [driverTab, setDriverTab] = useState('rides');
  const [myTripsRefreshing, setMyTripsRefreshing] = useState(false);
  const [myTripsRefreshError, setMyTripsRefreshError] = useState(null);
  const [sheetSnap, setSheetSnap] = useState('half');
  const [selectedRequestTxHash, setSelectedRequestTxHash] = useState(null);
  const [offerReferrer, setOfferReferrer] = useState(null);

  const { PrivateKeyModal, requestPrivateKey } = usePrivateKeyRequest();

  const hubSdk = useClutchSdk(userProfile.publicKey || undefined, '0x0', userProfile.privateKey);
  const defaultMapCenter = [27.1883, 56.3772];

  const hasActiveTrip = activeTrips.length > 0;

  const validRequests = rideRequests.filter((r) => (
    Number.isFinite(Number(r.pickupLocation?.latitude))
    && Number.isFinite(Number(r.pickupLocation?.longitude))
    && Number.isFinite(Number(r.dropoffLocation?.latitude))
    && Number.isFinite(Number(r.dropoffLocation?.longitude))
  ));
  const selectedRequest = validRequests.find((r) => r.txHash === selectedRequestTxHash) || null;

  // Clear a selection that disappeared (request fulfilled/cancelled).
  useEffect(() => {
    if (selectedRequestTxHash && !selectedRequest) setSelectedRequestTxHash(null);
  }, [selectedRequestTxHash, selectedRequest]);

  useEffect(() => {
    if (externalTab) {
      setDriverTab(externalTab);
    }
  }, [externalTab]);

  useEffect(() => {
    if (!userProfile.publicKey) {
      setActiveTrips([]);
      setActiveTripsLoading(false);
      return undefined;
    }
    setActiveTripsLoading(true);
    setActiveTripsError(null);
    const dispose = subscribeActiveTripsCompat(
      hubSdk,
      { driverAddress: userProfile.publicKey },
      {
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
      }
    );
    return () => dispose();
  }, [userProfile.publicKey, hubSdk]);

  useEffect(() => {
    if (!userProfile.publicKey) {
      setRecentTrips([]);
      setRecentTripsLoading(false);
      return undefined;
    }
    setRecentTripsLoading(true);
    setRecentTripsError(null);
    const dispose = subscribeRecentTripsCompat(
      hubSdk,
      { driverAddress: userProfile.publicKey },
      {
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
      }
    );
    return () => dispose();
  }, [userProfile.publicKey, hubSdk]);

  const fetchRideRequests = useCallback(async () => {
    setIsLoadingRides(true);
    setRidesError(null);
    try {
      const requests = await hubSdk.listRideRequests();
      setRideRequests(requests);
    } catch (err) {
      console.error('Failed to fetch ride requests:', err);
      setRidesError(err.message || 'Failed to load ride requests');
      setRideRequests([]);
    } finally {
      setIsLoadingRides(false);
    }
  }, [hubSdk]);

  useEffect(() => {
    setIsLoadingRides(true);
    setRidesError(null);
    const dispose = subscribeRideRequestsCompat(hubSdk, null, {
      onData: (requests) => {
        setRideRequests(requests);
        setIsLoadingRides(false);
      },
      onError: (err) => {
        console.error('Ride requests subscription error:', err);
        setRidesError(err.message || 'Failed to load ride requests');
        setRideRequests([]);
        setIsLoadingRides(false);
      },
    });
    return () => dispose();
  }, [hubSdk]);

  const handleFareChange = useCallback((txHash, value) => {
    setOfferFares((prev) => ({ ...prev, [txHash]: value }));
  }, []);

  const handleAcceptOffer = useCallback(async (req) => {
    if (!userProfile.publicKey) {
      setAcceptStatus({ type: 'warning', message: 'Connect your wallet first.' });
      return;
    }
    let offerFare;
    try {
      offerFare = offerFares[req.txHash] !== undefined ? parseUsdToClt(offerFares[req.txHash]) : req.fare;
    } catch {
      setAcceptStatus({ type: 'error', message: 'Enter a valid offer amount.' });
      return;
    }
    setAcceptingTxHash(req.txHash);
    setAcceptStatus(null);
    setOfferReferrer(null);
    try {
      // Private key needed before createUnsigned*: generateToken requires a signed challenge.
      let privateKey = userProfile.privateKey;
      if (!privateKey) {
        privateKey = await requestPrivateKey('Enter your private key to sign the ride offer:');
        if (!privateKey) {
          setAcceptStatus({ type: 'warning', message: 'Signing cancelled.' });
          setAcceptingTxHash(null);
          return;
        }
      }
      hubSdk.setPrivateKey(privateKey);
      const unsignedTx = await hubSdk.createUnsignedRideOffer({ rideRequestTxHash: req.txHash, fare: offerFare });
      const expected = { type: 'RideOffer', fare: offerFare, refTxHash: req.txHash };
      setOfferReferrer(verifyUnsignedTransaction(unsignedTx, expected).referrer);
      const signature = await hubSdk.signTransaction(unsignedTx, privateKey, expected);
      await hubSdk.submitTransaction(signature.rawTransaction);
      setAcceptStatus({ type: 'success', message: 'Offer submitted!' });
      setRefreshBalanceCounter((c) => c + 1);
      TransactionHistory.addTransaction(userProfile.publicKey, {
        type: 'Offer',
        timestamp: Date.now(),
        rideRequestTxHash: req.txHash,
        fare: offerFare.toString(),
        status: 'success',
        txHash: signature.txHash || '',
      });
      setTimeout(() => setAcceptStatus(null), 5000);
    } catch (err) {
      console.error(err);
      setAcceptStatus({ type: 'error', message: 'Failed: ' + (err.message || 'Unknown error') });
      TransactionHistory.addTransaction(userProfile.publicKey, {
        type: 'Offer',
        timestamp: Date.now(),
        rideRequestTxHash: req.txHash,
        fare: offerFare.toString(),
        status: 'failed',
        error: err.message,
      });
    } finally {
      setAcceptingTxHash(null);
    }
  }, [userProfile, offerFares, requestPrivateKey, hubSdk]);

  const refreshDriverMyTrips = useCallback(async () => {
    if (!userProfile.publicKey) return;
    setMyTripsRefreshing(true);
    setMyTripsRefreshError(null);
    try {
      const trips = await hubSdk.listActiveTrips({ driverAddress: userProfile.publicKey });
      setActiveTrips(trips);
      setActiveTripsError(null);
      setActiveTripsLoading(false);
    } catch (err) {
      console.error('Refresh my trips failed:', err);
      setMyTripsRefreshError(err.message || 'Failed to refresh');
    } finally {
      setMyTripsRefreshing(false);
    }
  }, [userProfile.publicKey, hubSdk]);

  const selPickup = selectedRequest
    ? [Number(selectedRequest.pickupLocation.latitude), Number(selectedRequest.pickupLocation.longitude)]
    : null;
  const selDropoff = selectedRequest
    ? [Number(selectedRequest.dropoffLocation.latitude), Number(selectedRequest.dropoffLocation.longitude)]
    : null;

  const tripWithRoute = activeTrips.find((t) => (
    Number.isFinite(Number(t?.pickupLocation?.latitude))
    && Number.isFinite(Number(t?.pickupLocation?.longitude))
    && Number.isFinite(Number(t?.dropoffLocation?.latitude))
    && Number.isFinite(Number(t?.dropoffLocation?.longitude))
  ));

  const sheetHeader = hasActiveTrip ? (
    <div className="sheet-header-row">
      <div>
        <h2 className="sheet-title">Trip in progress</h2>
        <p className="sheet-subtitle">Finish this trip before taking new requests.</p>
      </div>
      <button type="button" className="btn-ghost" onClick={refreshDriverMyTrips} disabled={myTripsRefreshing}>
        {myTripsRefreshing ? '…' : 'Refresh'}
      </button>
    </div>
  ) : (
    <div className="sheet-header-row">
      <div>
        <h2 className="sheet-title">{selectedRequest ? 'Ride request' : 'Available rides'}</h2>
        <p className="sheet-subtitle">
          {selectedRequest ? 'Route shown on the map.' : `${validRequests.length} open request${validRequests.length === 1 ? '' : 's'} · live updates`}
        </p>
      </div>
      <button type="button" className="btn-ghost" onClick={fetchRideRequests} disabled={isLoadingRides}>
        {isLoadingRides ? '…' : 'Refresh'}
      </button>
    </div>
  );

  return (
    <div className="mapfirst-view">
      <div className="mapfirst-map">
        <MapContainer center={defaultMapCenter} zoom={12} zoomControl={false} style={{ height: '100%', width: '100%' }}>
          <TileLayer url={MAP_TILE_URL} attribution={MAP_ATTRIBUTION} />

          {!hasActiveTrip && validRequests.map((req) => (
            <Marker
              key={req.txHash}
              position={[Number(req.pickupLocation.latitude), Number(req.pickupLocation.longitude)]}
              icon={pickupIcon}
              eventHandlers={{ click: () => setSelectedRequestTxHash(req.txHash) }}
            >
              <Popup>Pickup · {formatUsd(req.fare)}</Popup>
            </Marker>
          ))}

          {!hasActiveTrip && selectedRequest && (
            <>
              <Marker position={selDropoff} icon={dropoffIcon}><Popup>Dropoff</Popup></Marker>
              <Polyline positions={[selPickup, selDropoff]} color="var(--accent)" weight={4} opacity={0.9} />
              <MapFitBounds positions={[selPickup, selDropoff]} />
            </>
          )}

          {!hasActiveTrip && !selectedRequest && validRequests.length > 0 && (
            <MapFitBounds positions={validRequests.map((r) => [Number(r.pickupLocation.latitude), Number(r.pickupLocation.longitude)])} />
          )}

          {tripWithRoute && (
            <>
              <Marker position={[Number(tripWithRoute.pickupLocation.latitude), Number(tripWithRoute.pickupLocation.longitude)]} icon={pickupIcon}><Popup>Pickup</Popup></Marker>
              <Marker position={[Number(tripWithRoute.dropoffLocation.latitude), Number(tripWithRoute.dropoffLocation.longitude)]} icon={dropoffIcon}><Popup>Dropoff</Popup></Marker>
              <Polyline
                positions={[
                  [Number(tripWithRoute.pickupLocation.latitude), Number(tripWithRoute.pickupLocation.longitude)],
                  [Number(tripWithRoute.dropoffLocation.latitude), Number(tripWithRoute.dropoffLocation.longitude)],
                ]}
                color="var(--accent)"
                weight={4}
                opacity={0.9}
              />
              <MapFitBounds
                positions={[
                  [Number(tripWithRoute.pickupLocation.latitude), Number(tripWithRoute.pickupLocation.longitude)],
                  [Number(tripWithRoute.dropoffLocation.latitude), Number(tripWithRoute.dropoffLocation.longitude)],
                ]}
              />
            </>
          )}
        </MapContainer>
        <MapLegend style={{ position: 'absolute', top: 'calc(4rem + env(safe-area-inset-top))', left: '0.75rem', zIndex: 900 }} />
      </div>

      <Toast status={acceptStatus} onDismiss={() => setAcceptStatus(null)} />

      <BottomSheet snap={sheetSnap} onSnapChange={setSheetSnap} header={sheetHeader} ariaLabel="Driver panel">
        {!userProfile.publicKey ? (
          <EmptyState message="Connect your wallet to see ride requests." />
        ) : hasActiveTrip ? (
          <>
            {activeTripsError && <div className="status-banner error">{activeTripsError}</div>}
            {myTripsRefreshError && <div className="status-banner error">{myTripsRefreshError}</div>}
            {activeTrips.map((trip) => (
              <ActiveTripCard
                key={trip.txHash}
                trip={trip}
                cancelAction={{ userProfile, onSuccess: () => setRefreshBalanceCounter((prev) => prev + 1) }}
              />
            ))}
          </>
        ) : selectedRequest ? (
          <RequestDetail
            req={selectedRequest}
            userProfile={userProfile}
            hubSdk={hubSdk}
            offerFares={offerFares}
            handleFareChange={handleFareChange}
            handleAcceptOffer={handleAcceptOffer}
            acceptingTxHash={acceptingTxHash}
            offerReferrer={offerReferrer}
            disabled={hasActiveTrip}
            onBack={() => setSelectedRequestTxHash(null)}
          />
        ) : (
          <>
            {ridesError && <div className="status-banner error">{ridesError}</div>}
            {activeTripsError && <div className="status-banner error">{activeTripsError}</div>}
            {validRequests.length === 0 && !isLoadingRides && (
              <EmptyState
                message={
                  ridesError
                    ? 'Could not load the list. Use refresh to try again, or wait for the live connection to recover.'
                    : 'No ride requests yet. When passengers request rides, they appear here and on the map.'
                }
                action="Refresh available rides"
                onAction={fetchRideRequests}
                actionDisabled={isLoadingRides}
              />
            )}
            {validRequests.map((req) => (
              <button
                key={req.txHash}
                type="button"
                className="request-row"
                onClick={() => setSelectedRequestTxHash(req.txHash)}
              >
                <div className="request-row-main">
                  <span className="request-row-address">{truncAddr(req.passengerAddress)}</span>
                  <span className="request-row-meta">Tap to view route & make an offer</span>
                </div>
                <span className="fare-badge" title={`${req.fare} CLT`}>{formatUsd(req.fare)}</span>
              </button>
            ))}
          </>
        )}
      </BottomSheet>

      <OverlayPanel
        open={driverTab === 'recent'}
        title="Recent rides"
        onClose={() => {
          setDriverTab('rides');
          onTabSync?.('rides');
        }}
      >
        {!userProfile.publicKey ? (
          <EmptyState message="Connect your wallet to view recent rides." />
        ) : (
          <>
            {recentTripsError && <div className="status-banner error">{recentTripsError}</div>}
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 1rem 0' }}>
              Includes completed trips and cancelled rides. Active trips stay on the map.
            </p>
            {recentTrips.length > 0 ? (
              recentTrips.map((trip) => <CompletedTripCard key={trip.txHash} trip={trip} />)
            ) : !recentTripsLoading && !recentTripsError ? (
              <EmptyState message="No recent rides yet. When you finish paying or cancel a trip, it will appear here." />
            ) : null}
          </>
        )}
      </OverlayPanel>

      <PrivateKeyModal />
    </div>
  );
};

export default DriverView;
