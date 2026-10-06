import { useCallback, useEffect, useState } from 'react';
import { connectWallet, createWalletSigner, discoverInjectedWallets } from 'clutch-hub-sdk-js';
import {
  describeWalletError,
  firstAccount,
  forgetWalletId,
  recallWalletId,
  rememberWalletId,
} from '../utils/walletSession';

/** What the rest of the app reads as "who is signed in": an address and the signer behind it. */
export const NO_PROFILE = Object.freeze({ publicKey: '', signer: null });

function profileFor(wallet, account) {
  const signer = createWalletSigner(wallet.provider, account);
  return { publicKey: signer.address, signer };
}

/**
 * The wallet the person connected (MetaMask, Trust Wallet, ...). The app holds no key: it holds a
 * signer that asks the wallet, and every signature is a prompt in the wallet.
 *
 * - Looks for wallets when it starts.
 * - Connects again by itself on the next visit, without a prompt, when the wallet used last time
 *   still shares an account with this site (`eth_accounts` never opens a prompt).
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
      const found = await discoverInjectedWallets();
      setWallets(found);
      return found;
    } finally {
      setSearching(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    forgetWalletId();
    setConnected(null);
    setError('');
  }, []);

  const connect = useCallback(async (wallet) => {
    setError('');
    setConnecting(true);
    try {
      const signer = await connectWallet(wallet);
      setConnected({ wallet, profile: { publicKey: signer.address, signer } });
      rememberWalletId(wallet.id);
    } catch (err) {
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
        const account = firstAccount(await wallet.provider.request({ method: 'eth_accounts' }));
        if (account && !cancelled) {
          setConnected({ wallet, profile: profileFor(wallet, account) });
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
  const connectedWallet = connected?.wallet ?? null;
  useEffect(() => {
    const provider = connectedWallet?.provider;
    if (!provider?.on) return undefined;
    const onAccountsChanged = (accounts) => {
      const account = firstAccount(accounts);
      if (!account) {
        disconnect(); // the site was disconnected in the wallet
        return;
      }
      setConnected((current) =>
        current && current.profile.publicKey === account
          ? current
          : { wallet: connectedWallet, profile: profileFor(connectedWallet, account) },
      );
    };
    provider.on('accountsChanged', onAccountsChanged);
    return () => provider.removeListener?.('accountsChanged', onAccountsChanged);
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
