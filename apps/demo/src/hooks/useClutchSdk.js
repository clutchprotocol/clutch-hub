import { useMemo } from 'react';
import { ClutchHubSdk } from 'clutch-hub-sdk-js';
import { API_URL, CHAIN_ID } from '../config';

/**
 * Memoized ClutchHubSdk for the configured hub URL.
 * Recreates only when the effective public key or signer changes (avoids allocating a new SDK every render).
 *
 * `generateToken` requires a signed proof-of-key-ownership challenge, so pass the connected
 * wallet's signer whenever authenticated (JWT-guarded) calls will be made. The signer asks the
 * wallet, so the person sees a prompt the first time an authenticated call is made, and again when
 * the token expires. Subscriptions are public and never open one.
 *
 * Always passes `CHAIN_ID` (app config, never the hub) as the 4th constructor arg — required for
 * the chain-bound auth challenge and pinned for `signTransaction`'s verification.
 *
 * @param {string | undefined | null} publicKey
 * @param {string} [fallbackPublicKey='0x0'] Used when `publicKey` is empty (anonymous read-only hub calls).
 * @param {object | undefined | null} [signer] The wallet's signer (`userProfile.signer`).
 *   Ignored when falling back to the anonymous public key.
 */
export function useClutchSdk(publicKey, fallbackPublicKey = '0x0', signer) {
  const hasOwnKey =
    publicKey !== undefined && publicKey !== null && String(publicKey).trim() !== '';
  const effective = hasOwnKey ? String(publicKey).trim() : fallbackPublicKey;
  const effectiveSigner = hasOwnKey && signer ? signer : undefined;
  return useMemo(
    () => new ClutchHubSdk(API_URL, effective, effectiveSigner, CHAIN_ID),
    [effective, effectiveSigner]
  );
}
