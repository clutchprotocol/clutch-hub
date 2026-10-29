import { useCallback, useMemo, useState } from 'react';
import {
  ClutchHubSdk,
  createSessionKeySigner,
  generateSessionKey,
} from 'clutch-hub-sdk-js';
import { API_URL, CHAIN_ID } from '../config';
import { describeWalletError } from '../utils/walletSession';
import {
  BLOCKS_PER_HOUR,
  SESSION_HOURS,
  clearSession,
  loadSession,
  saveSession,
} from '../utils/sessionKey';

/**
 * "Approve once": the wallet signs one SessionKey transaction that authorizes a key made here, and
 * until it expires the app signs rides with that key without asking. Anything else (login,
 * withdrawals) still asks the wallet.
 *
 * Returns the profile to use in place of the wallet's: same address, a signer that uses the
 * session key for rides when one is active.
 */
export function useSessionKey(profile) {
  const account = profile.publicKey;
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const session = useMemo(
    () => (account ? loadSession(account) : null),
    // `version` forces a re-read after enable/disable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [account, version]
  );

  const sessionProfile = useMemo(() => {
    if (!session || !profile.signer) return profile;
    return { ...profile, signer: createSessionKeySigner(profile.signer, session.privateKey) };
  }, [profile, session]);

  const authorize = useCallback(
    async (validForBlocks, key) => {
      const sdk = new ClutchHubSdk(API_URL, account, profile.signer, CHAIN_ID);
      const unsigned = await sdk.createUnsignedSessionKey({ sessionKey: key.address, validForBlocks });
      // The hub picks the nonce and the block height but must not name the key, so check it.
      const signed = await sdk.signTransaction(unsigned, profile.signer, {
        type: 'SessionKey',
        sessionKey: key.address,
      });
      await sdk.submitTransaction(signed.rawTransaction);
    },
    [account, profile.signer]
  );

  const enable = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const key = generateSessionKey();
      await authorize(SESSION_HOURS * BLOCKS_PER_HOUR, key);
      saveSession(account, {
        privateKey: key.privateKey,
        address: key.address,
        expiresAtMs: Date.now() + SESSION_HOURS * 3600 * 1000,
      });
      setVersion((v) => v + 1);
    } catch (err) {
      setError(describeWalletError(err, 'Could not approve'));
    } finally {
      setBusy(false);
    }
  }, [account, authorize]);

  const disable = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      // Revoke on the chain first (one wallet prompt), then forget the key here. If the revoke
      // fails the key is kept, so the person is not told it is off while it still works.
      if (session) await authorize(0, { address: session.address });
      clearSession(account);
      setVersion((v) => v + 1);
    } catch (err) {
      setError(describeWalletError(err, 'Could not turn off'));
    } finally {
      setBusy(false);
    }
  }, [account, authorize, session]);

  return { profile: sessionProfile, active: !!session, expiresAtMs: session?.expiresAtMs, busy, error, enable, disable };
}
