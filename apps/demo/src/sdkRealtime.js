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

/**
 * The SDK's `subscribeName` when it has one, else `listName` polled every `intervalMs`.
 * @param {any} sdk
 */
function subscribeOrPoll(sdk, subscribeName, listName, arg, intervalMs, handlers) {
  if (typeof sdk[subscribeName] === 'function') {
    return sdk[subscribeName](arg, handlers);
  }
  return pollLoop(
    async () => {
      handlers.onData(await sdk[listName](arg));
    },
    intervalMs,
    handlers
  );
}

export function subscribeRideRequestsCompat(sdk, bounds, handlers) {
  return subscribeOrPoll(sdk, 'subscribeRideRequests', 'listRideRequests', bounds ?? undefined, RIDE_REQUESTS_POLL_MS, handlers);
}

export function subscribeRideOffersCompat(sdk, rideRequestTxHash, handlers) {
  return subscribeOrPoll(sdk, 'subscribeRideOffers', 'listRideOffers', rideRequestTxHash, RIDE_OFFERS_POLL_MS, handlers);
}

export function subscribeActiveTripsCompat(sdk, options, handlers) {
  return subscribeOrPoll(sdk, 'subscribeActiveTrips', 'listActiveTrips', options, ACTIVE_TRIPS_POLL_MS, handlers);
}

/** Recent rides: completed + cancelled (falls back to completed-only if SDK lacks `listRecentTrips`). */
export function subscribeRecentTripsCompat(sdk, options, handlers) {
  if (typeof sdk.subscribeRecentTrips === 'function' || typeof sdk.listRecentTrips === 'function') {
    return subscribeOrPoll(sdk, 'subscribeRecentTrips', 'listRecentTrips', options, ACTIVE_TRIPS_POLL_MS, handlers);
  }
  return subscribeOrPoll(sdk, 'subscribeCompletedTrips', 'listCompletedTrips', options, ACTIVE_TRIPS_POLL_MS, handlers);
}
