/** Map open ride requests to card rows for the signed-in passenger (shared by subscription + manual refresh). */
export function formatPassengerOpenRequests(allRequests, publicKey) {
  if (!publicKey) return [];
  const myRequests = allRequests.filter((r) => r.passengerAddress === publicKey);
  const stored = localStorage.getItem(`clutch_tx_${publicKey}`);
  let txMap = {};
  if (stored) {
    try {
      JSON.parse(stored).forEach((tx) => {
        if (tx.txHash) txMap[tx.txHash] = tx;
      });
    } catch {
      /* ignore */
    }
  }
  const formatted = myRequests.map((r) => {
    const pickupLat = Number(r.pickupLocation?.latitude);
    const pickupLng = Number(r.pickupLocation?.longitude);
    const dropoffLat = Number(r.dropoffLocation?.latitude);
    const dropoffLng = Number(r.dropoffLocation?.longitude);
    const localTx = txMap[r.txHash];
    return {
      type: 'Ride Request',
      timestamp: localTx?.timestamp ?? Date.now(),
      pickup: { lat: pickupLat, lng: pickupLng },
      dropoff: { lat: dropoffLat, lng: dropoffLng },
      fare: r.fare,
      txHash: r.txHash,
      passengerAddress: r.passengerAddress,
    };
  });
  return formatted
    .filter((r) => Number.isFinite(r.pickup.lat) && Number.isFinite(r.pickup.lng) && Number.isFinite(r.dropoff.lat) && Number.isFinite(r.dropoff.lng))
    .sort((a, b) => b.timestamp - a.timestamp);
}
