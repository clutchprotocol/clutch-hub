// WalletConnect v2, for a person whose wallet is on their phone. On a phone the app sees a wallet
// only inside that wallet's own browser, so the other way in is this: the person picks WalletConnect,
// the page shows a QR code or opens the wallet app, and the person approves the connection there. The
// wallet keeps the key and signs each action, as it does in a browser extension. The app holds no key
// here either: it holds a relay to the wallet.
//
// The library loads only when the person picks this option. The project ID comes from the build (see
// config.js), and nothing here reads the environment, so the tests run without a browser.

export const WALLETCONNECT_WALLET_ID = 'walletconnect';

/** The wallet-list entry, or null when no project ID is configured (then the option is not shown). */
export function walletConnectEntry(projectId) {
  return projectId ? { id: WALLETCONNECT_WALLET_ID, name: 'WalletConnect', kind: 'evm', lazy: true } : null;
}

/**
 * What the WalletConnect button says. Few people know the name WalletConnect, so the button names the
 * wallets it reaches instead. On a phone it opens the wallet app and comes back to this browser, which
 * is why it is the way in there: the other one, opening this page inside the wallet's own browser,
 * leaves the person in that browser.
 */
export function walletConnectLabel(mobile) {
  return mobile
    ? { name: 'MetaMask, Trust Wallet or another wallet app', hint: 'Approve in the wallet app, then come back to this page.' }
    : { name: 'Wallet on your phone', hint: 'Scan a QR code with MetaMask, Trust Wallet or another wallet app.' };
}

/** Start the library. Nothing is shown until the provider's `enable()` is called. */
async function initWalletConnect(projectId) {
  const { default: EthereumProvider } = await import('@walletconnect/ethereum-provider');
  return EthereumProvider.init({
    projectId,
    optionalChains: [1],
    showQrModal: true,
    metadata: {
      name: 'Clutch',
      description: 'Clutch Protocol rides',
      url: window.location.origin,
      icons: [],
      // Where the wallet sends the person back after they approve, on wallets that do so.
      redirect: { universal: window.location.href },
    },
  });
}

/**
 * One provider per page: `init` runs once and every caller shares its result. A failed start is not
 * kept, so the next attempt starts again. `init` is a parameter so the tests can run without the library.
 */
export function providerOnce(init = initWalletConnect) {
  let pending = null;
  return (projectId) => {
    pending ??= init(projectId).catch((error) => {
      pending = null;
      throw error;
    });
    return pending;
  };
}

const providerFor = providerOnce();

/**
 * The library's provider as an EIP-1193 provider, which is what the SDK expects. The SDK asks for the
 * accounts with `eth_requestAccounts` before there is a session, and the library refuses that call, so
 * it maps to `enable()`, which opens the connection and resolves to the accounts once the person
 * approves. Every other call, the events and `disconnect` go to the library unchanged.
 */
export function walletConnectAsEip1193(provider) {
  return {
    request: (args) => (args.method === 'eth_requestAccounts' ? provider.enable() : provider.request(args)),
    on: (event, listener) => provider.on(event, listener),
    removeListener: (event, listener) => provider.removeListener(event, listener),
    disconnect: () => provider.disconnect(),
  };
}

/**
 * The wallet to use for a list entry. A WalletConnect entry gets its provider here, and the first call
 * loads the library; an injected wallet comes back as it was.
 */
export async function attachWalletProvider(entry, projectId, provider = providerFor) {
  if (!entry?.lazy) return entry;
  const wallet = { ...entry };
  delete wallet.lazy;
  return { ...wallet, provider: walletConnectAsEip1193(await provider(projectId)) };
}

/**
 * Ends the WalletConnect session when the person disconnects in the app. Forgetting the wallet alone
 * leaves that session open, both in the browser and on the phone. Injected wallets are left alone: their
 * provider belongs to the browser. A session the phone has already ended makes `disconnect` throw; that
 * is expected, so it is ignored.
 */
export async function endWalletSession(wallet) {
  if (wallet?.id !== WALLETCONNECT_WALLET_ID) return;
  try {
    await wallet.provider.disconnect();
  } catch {
    // The phone ended the session first.
  }
}
