import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import MapFitBounds from './MapFitBounds';
import RouteLine from './RouteLine';
import { Receipt, Row, Rule, Meter, CopyableAddress } from './receipt';
import { MAP_ATTRIBUTION, MAP_TILE_URL } from '../config';
import { formatUsd } from '../utils/money';
import { pickupIcon, dropoffIcon } from '../utils/mapMarkers';

/** Read-only receipt for recent ride history (completed or cancelled). */
const CompletedTripCard = ({ trip }) => {
  const farePaid = BigInt(trip.farePaid ?? trip.fare_paid ?? 0);
  const totalFare = BigInt(trip.fare);
  const rawStatus = (trip.tripStatus ?? trip.trip_status ?? 'completed').toLowerCase();
  const isCancelled = rawStatus === 'cancelled';

  const puLat = Number(trip.pickupLocation.latitude);
  const puLng = Number(trip.pickupLocation.longitude);
  const doLat = Number(trip.dropoffLocation.latitude);
  const doLng = Number(trip.dropoffLocation.longitude);
  const pickup = [puLat, puLng];
  const dropoff = [doLat, doLng];

  return (
    <Receipt
      title="Trip receipt"
      status={isCancelled ? 'Cancelled' : 'Completed'}
      tone={isCancelled ? 'cancelled' : 'done'}
    >
      <Rule />
      <div className="map-wrapper receipt-map">
        <MapContainer center={pickup} zoom={13} style={{ height: 'clamp(120px, 18vh, 160px)', width: '100%' }}>
          <TileLayer url={MAP_TILE_URL} attribution={MAP_ATTRIBUTION} />
          <MapFitBounds positions={[pickup, dropoff]} />
          <RouteLine positions={[pickup, dropoff]} pending={isCancelled} />
          <Marker position={pickup} icon={pickupIcon}><Popup>Pickup</Popup></Marker>
          <Marker position={dropoff} icon={dropoffIcon}><Popup>Dropoff</Popup></Marker>
        </MapContainer>
      </div>
      <Row label="Pickup">{puLat.toFixed(4)}, {puLng.toFixed(4)}</Row>
      <Row label="Drop-off">{doLat.toFixed(4)}, {doLng.toFixed(4)}</Row>
      <Row label="Driver"><CopyableAddress address={trip.driverAddress} /></Row>
      <Row label="Passenger"><CopyableAddress address={trip.passengerAddress} /></Row>
      <Rule />
      <Row label="Fare" total>{formatUsd(totalFare)}</Row>
      <Row label="Settled">{formatUsd(farePaid)}</Row>
      <Meter paid={farePaid} total={totalFare} />
      <Rule />
      <Row label="Acceptance"><CopyableAddress address={trip.txHash} /></Row>
      <Row label="Offer"><CopyableAddress address={trip.rideOfferTxHash} /></Row>
    </Receipt>
  );
};

export default CompletedTripCard;
