import { useCallback, useEffect, useState } from 'react';
import {
  connectWallet,
  createSignerFor,
  discoverInjectedWallets,
  sharedWalletAccount,
  watchWalletAccounts,
} from 'clutch-hub-sdk-js';
import { WALLETCONNECT_PROJECT_ID } from '../config';
import {
  describeWalletError,
  forgetWalletId,
  recallWalletId,
  rememberWalletId,
} from '../utils/walletSession';
import { attachWalletProvider, endWalletSession, walletConnectEntry } from '../utils/walletConnect';

/** What the rest of the app reads as "who is signed in": an address and the signer behind it. */
const NO_PROFILE = Object.freeze({ publicKey: '', signer: null });

function profileFor(wallet, account) {
  const signer = createSignerFor(wallet, account);
  return { publicKey: signer.address, signer };
}

/**
 * The wallet the person connected (MetaMask, Trust Wallet, TronLink, ...). The app holds no key: it
 * holds a signer that asks the wallet, and every signature is a prompt in the wallet. The SDK knows
 * how each kind of wallet connects and signs, so nothing here depends on which one it is.
 *
 * - Looks for wallets when it starts.
 * - Connects again by itself on the next visit, without a prompt, when the wallet used last time
 *   still shares an account with this site (`sharedWalletAccount` never opens a prompt).
 * - Follows the wallet: another account becomes the signed-in account, and a wallet that stops
 *   sharing the site disconnects the app.
 *
 * @returns {{
 *   profile: { publicKey: string, signer: object | null },
 *   wallet: object | null,
 *   wallets: object[], searching: boolean, connecting: boolean, error: string,
 *   connect: (wallet: object) => Promise<void>, disconnect: () => void, search: () => Promise<object[]>,
 * }}
 */
export function useWalletConnection() {
  const [wallets, setWallets] = useState([]);
  const [searching, setSearching] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(null); // { wallet, profile } | null

  const search = useCallback(async () => {
    setSearching(true);
    try {
      // A WalletConnect entry (when the build has a project ID) is listed beside the injected wallets.
      // Its library loads only when the person picks it.
      const entry = walletConnectEntry(WALLETCONNECT_PROJECT_ID);
      const found = [...(await discoverInjectedWallets()), ...(entry ? [entry] : [])];
      setWallets(found);
      return found;
    } finally {
      setSearching(false);
    }
  }, []);

  const connectedWallet = connected?.wallet ?? null;

  const disconnect = useCallback(() => {
    endWalletSession(connectedWallet); // ends the WalletConnect session on the phone, if there is one
    forgetWalletId();
    setConnected(null);
    setError('');
  }, [connectedWallet]);

  const connect = useCallback(async (wallet) => {
    setError('');
    setConnecting(true);
    // A phone wallet reached through WalletConnect may send the person back in a new browser tab, or
    // the phone may have closed this one while the wallet was open. The session itself survives in
    // the library's storage, so the choice is remembered before the wallet opens: the page that the
    // person comes back to then picks the session up on start (below) instead of asking again.
    const viaRelay = Boolean(wallet.lazy);
    if (viaRelay) rememberWalletId(wallet.id);
    try {
      const target = await attachWalletProvider(wallet, WALLETCONNECT_PROJECT_ID);
      const signer = await connectWallet(target);
      setConnected({ wallet: target, profile: { publicKey: signer.address, signer } });
      rememberWalletId(wallet.id);
    } catch (err) {
      if (viaRelay) forgetWalletId();
      setError(describeWalletError(err));
    } finally {
      setConnecting(false);
    }
  }, []);

  // On start: look for wallets, then pick up the one used last time if it still shares an account.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const found = await search();
      if (cancelled) return;
      const remembered = recallWalletId();
      const wallet = found.find((candidate) => candidate.id === remembered);
      if (!wallet) return;
      try {
        const target = await attachWalletProvider(wallet, WALLETCONNECT_PROJECT_ID);
        const account = await sharedWalletAccount(target);
        if (account && !cancelled) {
          setConnected({ wallet: target, profile: profileFor(target, account) });
        }
      } catch {
        // The wallet would not say: the person connects by hand.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [search]);

  // Follow the wallet while it is connected.
  useEffect(() => {
    if (!connectedWallet) return undefined;
    return watchWalletAccounts(connectedWallet, (account) => {
      if (!account) {
        disconnect(); // the site was disconnected in the wallet, or the wallet was locked
        return;
      }
      setConnected((current) =>
        current && current.profile.publicKey === account
          ? current
          : { wallet: connectedWallet, profile: profileFor(connectedWallet, account) },
      );
    });
  }, [connectedWallet, disconnect]);

  return {
    profile: connected?.profile ?? NO_PROFILE,
    wallet: connectedWallet,
    wallets,
    searching,
    connecting,
    error,
    connect,
    disconnect,
    search,
  };
}
