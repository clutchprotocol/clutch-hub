/**
 * Live list updates: use SDK GraphQL-over-WebSocket subscriptions when the installed
 * `clutch-hub-sdk-js` exposes them; otherwise fall back to HTTP polling so the demo
 * still runs against older npm releases that only ship query helpers.
 */
import { ACTIVE_TRIPS_POLL_MS } from './pollIntervals';

const RIDE_REQUESTS_POLL_MS = 3000;
const RIDE_OFFERS_POLL_MS = 5000;

/**
 * @param {() => Promise<void>} asyncFn
 * @param {number} intervalMs
 * @param {{ onError?: (err: Error) => void }} handlers
 * @returns {() => void} dispose
 */
function pollLoop(asyncFn, intervalMs, handlers) {
  let stopped = false;
  const run = async () => {
    if (stopped) return;
    try {
      await asyncFn();
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      handlers.onError?.(err);
    }
  };
  run();
  const id = setInterval(run, intervalMs);
  return () => {
    stopped = true;
    clearInterval(id);
  };
}

/** @param {any} sdk */
export function subscribeRideRequestsCompat(sdk, bounds, handlers) {
  if (typeof sdk.subscribeRideRequests === 'function') {
    return sdk.subscribeRideRequests(bounds, handlers);
  }
  return pollLoop(
    async () => {
      const list = await sdk.listRideRequests(bounds ?? undefined);
      handlers.onData(list);
    },
    RIDE_REQUESTS_POLL_MS,
    handlers
  );
}

/** @param {any} sdk */
export function subscribeRideOffersCompat(sdk, rideRequestTxHash, handlers) {
  if (typeof sdk.subscribeRideOffers === 'function') {
    return sdk.subscribeRideOffers(rideRequestTxHash, handlers);
  }
  return pollLoop(
    async () => {
      const list = await sdk.listRideOffers(rideRequestTxHash);
      handlers.onData(list);
    },
    RIDE_OFFERS_POLL_MS,
    handlers
  );
}

/** @param {any} sdk */
export function subscribeActiveTripsCompat(sdk, options, handlers) {
  if (typeof sdk.subscribeActiveTrips === 'function') {
    return sdk.subscribeActiveTrips(options, handlers);
  }
  return pollLoop(
    async () => {
      const list = await sdk.listActiveTrips(options);
      handlers.onData(list);
    },
    ACTIVE_TRIPS_POLL_MS,
    handlers
  );
}

/** @param {any} sdk */
export function subscribeCompletedTripsCompat(sdk, options, handlers) {
  if (typeof sdk.subscribeCompletedTrips === 'function') {
    return sdk.subscribeCompletedTrips(options, handlers);
  }
  return pollLoop(
    async () => {
      const list = await sdk.listCompletedTrips(options);
      handlers.onData(list);
    },
    ACTIVE_TRIPS_POLL_MS,
    handlers
  );
}

/** Recent rides: completed + cancelled (falls back to completed-only if SDK lacks `listRecentTrips`). */
export function subscribeRecentTripsCompat(sdk, options, handlers) {
  if (typeof sdk.subscribeRecentTrips === 'function') {
    return sdk.subscribeRecentTrips(options, handlers);
  }
  if (typeof sdk.listRecentTrips === 'function') {
    return pollLoop(
      async () => {
        const list = await sdk.listRecentTrips(options);
        handlers.onData(list);
      },
      ACTIVE_TRIPS_POLL_MS,
      handlers
    );
  }
  return subscribeCompletedTripsCompat(sdk, options, handlers);
}
