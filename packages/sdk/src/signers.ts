import { Buffer } from 'buffer';
import { keccak_256 } from '@noble/hashes/sha3';
import * as secp from '@noble/secp256k1';
import type { Signature } from './types.js';

/*
 * Who signs a transaction.
 *
 * The SDK used to take a private key string and sign with it. A wallet (MetaMask, Trust Wallet)
 * never gives its key to a page, so the SDK now takes a `Signer`: an object that can be asked for
 * a signature. A key in memory is one kind of signer (`createLocalSigner`, in sdk.ts); a wallet is
 * another (`createWalletSigner`, here). Everywhere the SDK took a key it still takes a key string.
 *
 * A wallet will not sign a bare hash, so it signs a short readable text with `personal_sign`
 * (EIP-191), which hashes `"\x19Ethereum Signed Message:\n" + length + text`. The node and the Hub
 * API accept that signature next to the old one. The texts below are the contract with them:
 *
 *   transaction  clutch-tx:{chainId}:{hash}              hash = 64 lowercase hex, no 0x
 *   login        clutch-auth:{chainId}:{publicKey}:{timestamp}
 */

/** Strip a 0x/0X prefix. A copy of `stripHexPrefix` in sdk.ts, which imports this file. */
function strip0x(hex: string): string {
  return hex.replace(/^0x/i, '');
}

/** What a signer is asked to sign to send a transaction. */
export interface TransactionSigningRequest {
  /** Keccak-256 of the unsigned transaction: 64 lowercase hex characters, no `0x`. */
  hashHex: string;
  /** The chain the transaction is for. A wallet's prompt names it. */
  chainId: number;
}

/** What a signer is asked to sign to prove it owns a key to the Hub API. */
export interface AuthChallengeSigningRequest {
  /** The readable challenge, `clutch-auth:{chainId}:{publicKey}:{timestamp}`. */
  message: string;
  /** Keccak-256 of `message`: 64 lowercase hex characters, no `0x`. */
  hashHex: string;
}

/** Something that can sign for one account. */
export interface Signer {
  /** The account this signer signs for: `0x` and 40 lowercase hex characters. */
  readonly address: string;
  /** Sign a transaction. A key signs the hash string; a wallet signs `walletTransactionText`. */
  signTransaction(request: TransactionSigningRequest): Promise<Signature>;
  /** Sign the Hub API's proof-of-key-ownership challenge. A key signs its hash; a wallet signs the message. */
  signAuthChallenge(request: AuthChallengeSigningRequest): Promise<Signature>;
}

/**
 * The part of an EIP-1193 provider (`window.ethereum`, an EIP-6963 provider) that the SDK uses.
 * `on` and `removeListener` are there for apps that watch `accountsChanged`.
 */
export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, listener: (...args: any[]) => void): void;
  removeListener?(event: string, listener: (...args: any[]) => void): void;
}

/** The text a wallet signs for a transaction. The hash is written without `0x`, in lower case. */
export function walletTransactionText(chainId: number, hashHex: string): string {
  return `clutch-tx:${chainId}:${strip0x(hashHex).toLowerCase()}`;
}

/** What `personal_sign` hashes and signs: `Keccak256("\x19Ethereum Signed Message:\n" + length + text)`. */
export function personalSignDigest(text: string): Uint8Array {
  const body = Buffer.from(text, 'utf8');
  const prefix = Buffer.from(`\x19Ethereum Signed Message:\n${body.length}`, 'utf8');
  return keccak_256(Buffer.concat([prefix, body]));
}

/**
 * `r`, `s` and `v` from a wallet's answer: `0x` and 130 hex characters (65 bytes). Some wallets
 * answer with a recovery id of 0 or 1 instead of 27 or 28; the node reads only 27 and 28.
 */
function parseWalletSignature(raw: unknown): Signature {
  if (typeof raw !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(raw)) {
    throw new Error('the wallet answered with a signature the SDK cannot read (expected 65 bytes of hex)');
  }
  const hex = raw.slice(2).toLowerCase();
  let v = parseInt(hex.slice(128, 130), 16);
  if (v < 27) {
    v += 27;
  }
  if (v !== 27 && v !== 28) {
    throw new Error(`the wallet answered with an unexpected recovery id (${v})`);
  }
  return { r: '0x' + hex.slice(0, 64), s: '0x' + hex.slice(64, 128), v };
}

/** The address a signature over `digest` came from, or `null` when it does not recover to one. */
function recoverAddress(digest: Uint8Array, signature: Signature): string | null {
  try {
    const compact = strip0x(signature.r).padStart(64, '0') + strip0x(signature.s).padStart(64, '0');
    const point = secp.Signature.fromCompact(compact)
      .addRecoveryBit(signature.v - 27)
      .recoverPublicKey(digest);
    return '0x' + Buffer.from(keccak_256(point.toRawBytes(false).slice(1)).slice(-20)).toString('hex');
  } catch {
    return null;
  }
}

/**
 * A signer that asks a wallet to sign with `personal_sign`. The wallet shows the user the text,
 * and keeps the key. `address` is the account to sign for; it is lowercased, because the hash of a
 * transaction commits to `from` and the node reads `from` in lower case.
 *
 * The signature is checked here before it is returned: a wallet that signs with another account
 * (the user switched accounts) would otherwise be found out later, as a refusal from the node
 * that does not say why.
 */
export function createWalletSigner(provider: Eip1193Provider, address: string): Signer {
  const account = address.toLowerCase();

  async function personalSign(text: string): Promise<Signature> {
    // Always hex: a text that starts with "0x" would be read by the wallet as bytes, not text.
    const message = '0x' + Buffer.from(text, 'utf8').toString('hex');
    const raw = await provider.request({ method: 'personal_sign', params: [message, account] });
    const signature = parseWalletSignature(raw);
    const signedBy = recoverAddress(personalSignDigest(text), signature);
    if (signedBy !== account) {
      throw new Error(
        `the wallet signed with ${signedBy ?? 'an account that cannot be read'}, not ${account}: switch to ${account} in the wallet and try again`
      );
    }
    return signature;
  }

  return {
    address: account,
    signTransaction: ({ hashHex, chainId }) => personalSign(walletTransactionText(chainId, hashHex)),
    signAuthChallenge: ({ message }) => personalSign(message),
  };
}

/** A wallet found in the page. */
export interface InjectedWallet {
  /** The EIP-6963 `rdns` (for example `io.metamask`), or `injected-0` for a bare `window.ethereum`. */
  id: string;
  name: string;
  /** A `data:` image address from the wallet, when it announced one. */
  icon?: string;
  provider: Eip1193Provider;
}

export interface WalletDiscoveryOptions {
  /** Where to look. Default: `window`. */
  host?: EventTarget & { ethereum?: unknown };
  /** How long to listen for EIP-6963 announcements, in milliseconds. Default: 300. */
  timeoutMs?: number;
}

function isProvider(value: unknown): value is Eip1193Provider {
  return !!value && typeof (value as Eip1193Provider).request === 'function';
}

/** A name for a provider that did not announce one. Trust Wallet sets `isMetaMask` too, so it is checked first. */
function legacyName(provider: Eip1193Provider): string {
  const flags = provider as unknown as Record<string, unknown>;
  if (flags.isTrust || flags.isTrustWallet) return 'Trust Wallet';
  if (flags.isMetaMask) return 'MetaMask';
  if (flags.isCoinbaseWallet) return 'Coinbase Wallet';
  return 'Browser wallet';
}

/**
 * The wallets in this page. A wallet that follows EIP-6963 announces itself, so several can be
 * listed side by side; one that only sets `window.ethereum` (older wallets, some in-app browsers)
 * is added when no announced wallet is that same provider. Returns an empty list when there is no
 * wallet, or when there is no page (Node).
 */
export async function discoverInjectedWallets(options: WalletDiscoveryOptions = {}): Promise<InjectedWallet[]> {
  const host = options.host ?? (typeof window !== 'undefined' ? (window as unknown as WalletDiscoveryOptions['host']) : undefined);
  if (!host) {
    return [];
  }
  const found = new Map<string, InjectedWallet>();

  const onAnnounce = (event: Event): void => {
    const detail = (event as Event & { detail?: { info?: Record<string, string>; provider?: unknown } }).detail;
    if (!detail || !isProvider(detail.provider)) {
      return;
    }
    const info = detail.info ?? {};
    const id = info.rdns || info.uuid || info.name || `announced-${found.size}`;
    if (!found.has(id)) {
      found.set(id, { id, name: info.name || id, icon: info.icon, provider: detail.provider });
    }
  };

  host.addEventListener('eip6963:announceProvider', onAnnounce);
  try {
    host.dispatchEvent(new Event('eip6963:requestProvider'));
    await new Promise<void>((resolve) => setTimeout(resolve, options.timeoutMs ?? 300));
  } finally {
    host.removeEventListener('eip6963:announceProvider', onAnnounce);
  }

  const wallets = [...found.values()];
  const ethereum = host.ethereum as (Eip1193Provider & { providers?: unknown }) | undefined;
  if (isProvider(ethereum)) {
    const list: unknown[] =
      Array.isArray(ethereum.providers) && ethereum.providers.length > 0 ? ethereum.providers : [ethereum];
    list.filter(isProvider).forEach((provider, index) => {
      if (!wallets.some((wallet) => wallet.provider === provider)) {
        wallets.push({ id: `injected-${index}`, name: legacyName(provider), provider });
      }
    });
  }
  return wallets;
}

/**
 * Ask a wallet to share its account (the wallet shows its own prompt) and return a signer for it.
 * Rejects when the user says no (the provider's error, code 4001) or when no account is shared.
 */
export async function connectWallet(wallet: InjectedWallet): Promise<Signer> {
  const accounts = await wallet.provider.request({ method: 'eth_requestAccounts' });
  const first = Array.isArray(accounts) ? accounts[0] : undefined;
  if (typeof first !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(first)) {
    throw new Error('the wallet did not share an account');
  }
  return createWalletSigner(wallet.provider, first);
}
