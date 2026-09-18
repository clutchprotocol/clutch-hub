import { useMemo } from 'react';
import { ClutchHubSdk } from 'clutch-hub-sdk-js';
import { API_URL, CHAIN_ID } from '../config';

/**
 * Memoized ClutchHubSdk for the configured hub URL.
 * Recreates only when the effective public/private key changes (avoids allocating a new SDK every render).
 *
 * `generateToken` requires a signed proof-of-key-ownership challenge, so pass the wallet's
 * private key whenever authenticated (JWT-guarded) calls will be made. If the key is only
 * available later (e.g. collected via modal), call `sdk.setPrivateKey(pk)` before the first
 * authenticated call instead.
 *
 * Always passes `CHAIN_ID` (app config, never the hub) as the 4th constructor arg — required for
 * the chain-bound auth challenge and pinned for `signTransaction`'s verification.
 *
 * @param {string | undefined | null} publicKey
 * @param {string} [fallbackPublicKey='0x0'] Used when `publicKey` is empty (anonymous read-only hub calls).
 * @param {string | undefined | null} [privateKey] Wallet private key for signing auth challenges.
 *   Ignored when falling back to the anonymous public key.
 */
export function useClutchSdk(publicKey, fallbackPublicKey = '0x0', privateKey) {
  const hasOwnKey =
    publicKey !== undefined && publicKey !== null && String(publicKey).trim() !== '';
  const effective = hasOwnKey ? String(publicKey).trim() : fallbackPublicKey;
  const effectivePrivateKey =
    hasOwnKey && privateKey !== undefined && privateKey !== null && String(privateKey).trim() !== ''
      ? String(privateKey).trim()
      : undefined;
  return useMemo(
    () => new ClutchHubSdk(API_URL, effective, effectivePrivateKey, CHAIN_ID),
    [effective, effectivePrivateKey]
  );
}
