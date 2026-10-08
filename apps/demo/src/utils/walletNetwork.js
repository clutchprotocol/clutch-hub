// "Add Clutch to your wallet": adds the Clutch network to MetaMask or Trust Wallet, so the wallet
// shows the person's CLT balance next to their other coins.
//
// The Hub API answers the wallet's questions at `<API_URL>/rpc` (services/hub-api/src/hub/eth_rpc.rs).
// It is read-only: the wallet can show the balance, and sending from the wallet is refused with a
// message that says to send from this app. The wallet's chain id comes from that endpoint itself
// (eth_chainId), so the app never holds a second copy of it that could drift. Wallets assume 18
// decimals for a network's coin; the endpoint scales the balance, so 1 CLT-dollar shows as 1 CLT.
//
// TronLink cannot add networks, so the button is for Ethereum wallets only (`canAddNetwork`).
// Nothing here reads the environment, so the tests run without a browser.

/** The `/rpc` URL for a Hub API base URL. */
export function rpcUrlFor(apiUrl) {
  return `${String(apiUrl).replace(/\/+$/, '')}/rpc`;
}

/** True for a wallet that can be asked to add a network: an Ethereum wallet, not TronLink. */
export function canAddNetwork(wallet) {
  return Boolean(wallet?.provider) && wallet.kind !== 'tron';
}

/**
 * The `wallet_addEthereumChain` parameters (EIP-3085). `chainIdHex` is what the endpoint answered.
 * The explorer is left out when this network has none: a wallet refuses an empty URL.
 */
export function addNetworkParams({ chainIdHex, rpcUrl, explorerUrl, isTestnet }) {
  const params = {
    chainId: chainIdHex,
    chainName: isTestnet ? 'Clutch Testnet' : 'Clutch',
    nativeCurrency: { name: 'Clutch', symbol: 'CLT', decimals: 18 },
    rpcUrls: [rpcUrl],
  };
  if (explorerUrl) params.blockExplorerUrls = [explorerUrl];
  return params;
}

/** Asks the endpoint which chain id wallets should use. Throws on anything but a hex id. */
export async function fetchWalletChainId(rpcUrl, fetchImpl = globalThis.fetch) {
  const res = await fetchImpl(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
  });
  if (!res.ok) throw new Error(`The Clutch network did not answer (HTTP ${res.status}).`);
  const body = await res.json();
  if (typeof body?.result !== 'string' || !/^0x[0-9a-f]+$/i.test(body.result)) {
    throw new Error('The Clutch network gave no chain id.');
  }
  return body.result.toLowerCase();
}

/**
 * Adds the network to the wallet. The wallet shows its own prompt; most switch to the network once
 * it is added. Resolves to the parameters sent. Rejects with the wallet's error when the person
 * says no (code 4001), which `describeWalletError` turns into words.
 */
export async function addClutchToWallet(wallet, { apiUrl, explorerUrl, isTestnet }, fetchImpl) {
  const rpcUrl = rpcUrlFor(apiUrl);
  const chainIdHex = await fetchWalletChainId(rpcUrl, fetchImpl);
  const params = addNetworkParams({ chainIdHex, rpcUrl, explorerUrl, isTestnet });
  await wallet.provider.request({ method: 'wallet_addEthereumChain', params: [params] });
  return params;
}
