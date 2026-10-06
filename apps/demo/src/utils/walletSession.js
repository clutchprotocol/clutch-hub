// Small pure helpers for the wallet connection. They sit apart from the React hook so that
// `node --test` can check them without a browser.
//
// The app holds no key. What it remembers about a wallet is one id (which wallet to look for on
// the next visit), and it asks the wallet, in plain words, before every signature.

const WALLET_ID_KEY = 'clutch_wallet_id';

/**
 * Where the app used to keep private keys, when it made them in the browser (removed 2026-10-06).
 * A plain-text key must not outlive the feature that wrote it, so `removeLegacyKeys` clears them.
 */
const LEGACY_KEY_NAMES = ['passenger', 'driver'].flatMap((role) => [
  `clutch_${role}_publicKey`,
  `clutch_${role}_privateKey`,
]);

/** The storage, or null where the browser refuses it (private mode, blocked cookies) or there is none (Node). */
function storageOrNull(storage) {
  try {
    return storage ?? globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Remember which wallet was used. Only its id is kept, never a key. */
export function rememberWalletId(id, storage) {
  try {
    storageOrNull(storage)?.setItem(WALLET_ID_KEY, id);
  } catch {
    // No memory is no harm: the person connects again by hand.
  }
}

/** The wallet used last time, or '' when there is none. */
export function recallWalletId(storage) {
  try {
    return storageOrNull(storage)?.getItem(WALLET_ID_KEY) || '';
  } catch {
    return '';
  }
}

export function forgetWalletId(storage) {
  try {
    storageOrNull(storage)?.removeItem(WALLET_ID_KEY);
  } catch {
    // Nothing to forget.
  }
}

/** Delete the private keys that an older version of this app stored in plain text. */
export function removeLegacyKeys(storage) {
  try {
    const target = storageOrNull(storage);
    LEGACY_KEY_NAMES.forEach((name) => target?.removeItem(name));
  } catch {
    // Storage blocked: there is nothing the app can read or delete.
  }
}

/** The first account of an `eth_accounts` or `accountsChanged` answer, in lower case; '' when there is none. */
export function firstAccount(accounts) {
  const first = Array.isArray(accounts) ? accounts[0] : undefined;
  return typeof first === 'string' && /^0x[0-9a-fA-F]{40}$/.test(first) ? first.toLowerCase() : '';
}

/**
 * Plain words for what went wrong in a wallet. The codes are EIP-1193's. Anything else keeps its
 * own message, which the SDK and the hub write for people; `fallback` is for an error with none.
 */
export function describeWalletError(error, fallback = 'Something went wrong with your wallet.') {
  switch (error?.code) {
    case 4001:
      return 'You said no in your wallet, so nothing was sent.';
    case -32002:
      return 'Your wallet already has a request open. Open your wallet, finish or reject it, then try again.';
    case 4100:
      return 'Your wallet has not shared this account with the app. Connect your wallet again.';
    case 4900:
    case 4901:
      return 'Your wallet is not connected. Open it and try again.';
    default:
      return error?.message || fallback;
  }
}

/** The line shown while a wallet prompt is open. A wallet shows the text it signs, not the ride, so the app says what it is for. */
export function approveInWalletMessage(what, signedIn = true) {
  return signedIn ? `Approve in your wallet: ${what}.` : `Approve in your wallet: sign in, then ${what}.`;
}

export function isMobileUserAgent(userAgent) {
  return /Android|iPhone|iPad|iPod/i.test(String(userAgent ?? ''));
}

/**
 * Where to get a wallet. On a phone the best help is to open this same page inside the wallet's own
 * browser, where the wallet is already present; on a computer it is to install the extension.
 */
export function walletHelpLinks({ href, mobile }) {
  if (mobile) {
    const withoutScheme = String(href).replace(/^https?:\/\//, '');
    return [
      { id: 'metamask', label: 'Open in MetaMask', url: `https://metamask.app.link/dapp/${withoutScheme}` },
      {
        id: 'trust',
        label: 'Open in Trust Wallet',
        url: `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(href)}`,
      },
    ];
  }
  return [
    { id: 'metamask', label: 'Get MetaMask', url: 'https://metamask.io/download/' },
    { id: 'trust', label: 'Get Trust Wallet', url: 'https://trustwallet.com/download' },
  ];
}
