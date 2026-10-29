// A session key lets the app sign ride transactions without a wallet prompt for a few hours,
// after the person approved it once. Small pure helpers, apart from React so `node --test` can
// check them.
//
// The private key sits in this browser's storage. It can sign only ride transactions: the node
// refuses it for a transfer, a withdrawal or a new authorization, so a stolen key can start,
// accept and pay rides from this account until it expires or is revoked, and nothing else.

const PREFIX = 'clutch_session_key_';

/** About 20 seconds per block (three validators): 180 blocks an hour. */
export const BLOCKS_PER_HOUR = 180;
/** How long one approval lasts. */
export const SESSION_HOURS = 8;

function storageOrNull(storage) {
  try {
    return storage ?? globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function keyFor(account) {
  return PREFIX + String(account).toLowerCase();
}

/** The saved session for this account, or null when there is none or it has expired. */
export function loadSession(account, storage, now = Date.now()) {
  try {
    const raw = storageOrNull(storage)?.getItem(keyFor(account));
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (!saved?.privateKey || !(saved.expiresAtMs > now)) {
      storageOrNull(storage)?.removeItem(keyFor(account));
      return null;
    }
    return saved;
  } catch {
    return null;
  }
}

export function saveSession(account, session, storage) {
  try {
    storageOrNull(storage)?.setItem(keyFor(account), JSON.stringify(session));
  } catch {
    // No storage: the approval only lasts until the page closes.
  }
}

export function clearSession(account, storage) {
  try {
    storageOrNull(storage)?.removeItem(keyFor(account));
  } catch {
    // Nothing to clear.
  }
}
