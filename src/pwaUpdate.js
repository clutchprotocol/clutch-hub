import { registerSW } from 'virtual:pwa-register';

/**
 * Service worker registration, and a way for React to hear about a waiting update.
 *
 * `registerType` is 'prompt', not 'autoUpdate'. autoUpdate reloads the page the instant a new
 * build activates, which in this app can mean losing a half-entered fare or a pickup pin someone
 * placed thirty seconds ago. A new build is never urgent enough to take the page away mid-ride, so
 * the user is told and decides when.
 *
 * The browser only checks for a new worker on navigation, so a tab left open all day would never
 * notice. Hence the timer: the request is conditional and answers 304 when nothing has shipped.
 *
 * Lives outside React because registration must happen once per document, not once per mount.
 */

const listeners = new Set();
let updateReady = false;
let applyUpdate = () => {};

const CHECK_INTERVAL_MS = 60 * 1000;

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    updateReady = true;
    listeners.forEach((fn) => fn(true));
  },
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;
    setInterval(() => { registration.update(); }, CHECK_INTERVAL_MS);
  },
});

// `true` tells the waiting worker to skip waiting and take over; the page reloads once it does.
applyUpdate = () => updateSW(true);

export function subscribeToUpdate(fn) {
  listeners.add(fn);
  fn(updateReady);
  return () => listeners.delete(fn);
}

export function reloadForUpdate() {
  applyUpdate();
}
