import { Buffer } from 'buffer';
import { keccak_256 } from '@noble/hashes/sha3';
import { sha256 } from '@noble/hashes/sha256';
import * as secp from '@noble/secp256k1';
import type { Signature } from './types.js';

/*
 * Who signs a transaction.
 *
 * The SDK used to take a private key string and sign with it. A wallet (MetaMask, Trust Wallet,
 * TronLink) never gives its key to a page, so the SDK now takes a `Signer`: an object that can be
 * asked for a signature. A key in memory is one kind of signer (`createLocalSigner`, in sdk.ts); a
 * wallet is another (`createWalletSigner` and `createTronLinkSigner`, here). Everywhere the SDK
 * took a key it still takes a key string.
 *
 * A wallet will not sign a bare hash, so it signs a short readable text. MetaMask and Trust Wallet
 * use `personal_sign` (EIP-191), which hashes `"\x19Ethereum Signed Message:\n" + length + text`.
 * TronLink uses `signMessageV2` (TIP-191), which hashes `"\x19TRON Signed Message:\n" + length +
 * text`: the same key and the same 20-byte address, with another prefix. The node and the Hub API
 * accept both signatures next to the old one. The texts below are the contract with them:
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
  /**
   * True when signing opens a prompt for a person (a wallet). The SDK never asks such a signer for
   * a signature in the background, for example when a subscription reconnects; only a call the
   * app makes (create or sign a transaction) can open a prompt.
   */
  readonly interactive?: boolean;
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

/** What TronLink's `signMessageV2` (TIP-191) hashes and signs: `Keccak256("\x19TRON Signed Message:\n" + length + text)`. */
export function tronSignDigest(text: string): Uint8Array {
  const body = Buffer.from(text, 'utf8');
  const prefix = Buffer.from(`\x19TRON Signed Message:\n${body.length}`, 'utf8');
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
    interactive: true,
    signTransaction: ({ hashHex, chainId }) => personalSign(walletTransactionText(chainId, hashHex)),
    signAuthChallenge: ({ message }) => personalSign(message),
  };
}

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Decode(text: string): Uint8Array {
  const digits: number[] = []; // base 256, least significant first
  for (const char of text) {
    let carry = BASE58_ALPHABET.indexOf(char);
    if (carry < 0) {
      throw new Error(`"${char}" is not a base58 character`);
    }
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] * 58;
      digits[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      digits.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const char of text) {
    if (char !== '1') break;
    digits.push(0); // each leading "1" is a zero byte
  }
  return Uint8Array.from(digits.reverse());
}

/**
 * A TRON address as the Clutch address of the same key: `0x` and 40 lowercase hex characters.
 *
 * A TRON account is an Ethereum-type key (the same curve, the same Keccak-256, the same 20 address
 * bytes). TRON writes those bytes in base58 (`T…`): `0x41`, the 20 bytes, and 4 bytes of checksum,
 * and the checksum is checked here. A `0x` address and the `41…` hex form are accepted as they are.
 */
export function tronAddressToHex(address: string): string {
  if (/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return address.toLowerCase();
  }
  if (/^41[0-9a-fA-F]{40}$/.test(address)) {
    return '0x' + address.slice(2).toLowerCase();
  }
  const bytes = base58Decode(address);
  if (bytes.length !== 25 || bytes[0] !== 0x41) {
    throw new Error(`"${address}" is not a TRON address`);
  }
  const checksum = sha256(sha256(bytes.slice(0, 21))).slice(0, 4);
  if (!checksum.every((byte, index) => byte === bytes[21 + index])) {
    throw new Error(`"${address}" is not a TRON address: its checksum is wrong`);
  }
  return '0x' + Buffer.from(bytes.slice(1, 21)).toString('hex');
}

/** The part of the `tronWeb` that TronLink puts on its provider that the SDK uses. */
export interface TronWebLike {
  ready?: boolean;
  defaultAddress?: { base58?: string | false };
  trx?: { signMessageV2?(message: string): Promise<unknown> };
}

/**
 * TronLink's provider (`window.tron`, or the one it announces with TIP-6963): EIP-1193 plus a
 * `tronWeb`, which is `false` until the person lets this site use TronLink.
 */
export interface TronLinkProvider extends Eip1193Provider {
  tronWeb?: TronWebLike | false;
}

/** A TRON address from a wallet's answer as a Clutch address, or `null` when it is not one. */
function tronAccountOf(raw: unknown): string | null {
  try {
    return typeof raw === 'string' ? tronAddressToHex(raw) : null;
  } catch {
    return null;
  }
}

const INVALID_INPUT = /invalid transaction provided/i;

/**
 * A signer that asks TronLink to sign with `signMessageV2` (TIP-191). TronLink shows the person the
 * text and keeps the key. `address` is the account to sign for (a `0x` address, or the base58 one
 * TronLink shows). It is checked the same way `createWalletSigner` checks: the signature is
 * recovered here, and one from another account is refused before it leaves the SDK.
 *
 * TronLink's documentation is not clear on what `signMessageV2` takes: one page says a hex string
 * and another says plain text or hex. So the text goes in plain first. A TronLink that takes only
 * hex answers "Invalid transaction provided" before it opens a prompt, and then the text goes in
 * again as `0x` hex of its UTF-8 bytes. Any other answer ends the call, because a second try would
 * open a second prompt.
 */
export function createTronLinkSigner(provider: TronLinkProvider, address: string): Signer {
  const account = tronAddressToHex(address);

  async function tronSign(text: string): Promise<Signature> {
    const trx = provider.tronWeb ? provider.tronWeb.trx : undefined;
    if (!trx || typeof trx.signMessageV2 !== 'function') {
      throw new Error('TronLink is locked, or has not shared this site: open TronLink and connect again');
    }
    const hexText = '0x' + Buffer.from(text, 'utf8').toString('hex');
    let raw: unknown;
    try {
      raw = await trx.signMessageV2(text);
    } catch (error) {
      if (!INVALID_INPUT.test(error instanceof Error ? error.message : String(error))) {
        throw error;
      }
      raw = await trx.signMessageV2(hexText);
    }
    const signature = parseWalletSignature(raw);
    const signedBy = recoverAddress(tronSignDigest(text), signature);
    if (signedBy !== account) {
      // A TronLink that read the hex as text would sign the text of the hex. Say so, because that
      // is not the person's fault and switching accounts would not help.
      if (recoverAddress(tronSignDigest(hexText), signature) === account) {
        throw new Error('this TronLink signed the hex text, not the message, so the signature is not valid for Clutch: update TronLink');
      }
      throw new Error(
        `TronLink signed with ${signedBy ?? 'an account that cannot be read'}, not ${account}: switch to ${account} in TronLink and try again`
      );
    }
    return signature;
  }

  return {
    address: account,
    interactive: true,
    signTransaction: ({ hashHex, chainId }) => tronSign(walletTransactionText(chainId, hashHex)),
    signAuthChallenge: ({ message }) => tronSign(message),
  };
}

/** A wallet found in the page. */
export interface InjectedWallet {
  /** The EIP-6963 or TIP-6963 `rdns` (for example `io.metamask`), or `injected-0` for a bare `window.ethereum`. */
  id: string;
  name: string;
  /** A `data:` image address from the wallet, when it announced one. */
  icon?: string;
  /**
   * `evm` (MetaMask, Trust Wallet: signs with `personal_sign`) or `tron` (TronLink: signs with
   * `signMessageV2`). Default `evm`.
   */
  kind?: 'evm' | 'tron';
  /** For a `tron` wallet this is a {@link TronLinkProvider}. */
  provider: Eip1193Provider;
}

export interface WalletDiscoveryOptions {
  /** Where to look. Default: `window`. */
  host?: EventTarget & { ethereum?: unknown; tron?: unknown; tronLink?: unknown };
  /** How long to listen for EIP-6963 and TIP-6963 announcements, in milliseconds. Default: 300. */
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
 * The wallets in this page. A wallet that follows EIP-6963 (MetaMask, Trust Wallet) or TIP-6963
 * (TronLink, the same idea for TRON) announces itself, so several can be listed side by side. One
 * that only sets a global is added when no announced wallet is that same provider: `window.ethereum`
 * (older wallets, some in-app browsers), or `window.tron` / `window.tronLink` for TronLink. Returns
 * an empty list when there is no wallet, or when there is no page (Node).
 */
export async function discoverInjectedWallets(options: WalletDiscoveryOptions = {}): Promise<InjectedWallet[]> {
  const host = options.host ?? (typeof window !== 'undefined' ? (window as unknown as WalletDiscoveryOptions['host']) : undefined);
  if (!host) {
    return [];
  }
  const announcedEvm = new Map<string, InjectedWallet>();
  const announcedTron = new Map<string, InjectedWallet>();

  const onAnnounce = (found: Map<string, InjectedWallet>, kind: 'evm' | 'tron') => (event: Event): void => {
    const detail = (event as Event & { detail?: { info?: Record<string, string>; provider?: unknown } }).detail;
    if (!detail || !isProvider(detail.provider)) {
      return;
    }
    const info = detail.info ?? {};
    const id = info.rdns || info.uuid || info.name || `announced-${found.size}`;
    if (!found.has(id)) {
      found.set(id, { id, name: info.name || id, icon: info.icon, kind, provider: detail.provider });
    }
  };
  const onEvm = onAnnounce(announcedEvm, 'evm');
  const onTron = onAnnounce(announcedTron, 'tron');

  host.addEventListener('eip6963:announceProvider', onEvm);
  host.addEventListener('TIP6963:announceProvider', onTron);
  try {
    host.dispatchEvent(new Event('eip6963:requestProvider'));
    host.dispatchEvent(new Event('TIP6963:requestProvider'));
    await new Promise<void>((resolve) => setTimeout(resolve, options.timeoutMs ?? 300));
  } finally {
    host.removeEventListener('eip6963:announceProvider', onEvm);
    host.removeEventListener('TIP6963:announceProvider', onTron);
  }

  const tronWallets = [...announcedTron.values()];
  if (tronWallets.length === 0) {
    // `window.tronLink` is the older name of `window.tron`; the two are the same wallet.
    const bare = [host.tron, host.tronLink].find(isProvider);
    if (bare) {
      tronWallets.push({ id: 'injected-tron', name: 'TronLink', kind: 'tron', provider: bare });
    }
  }

  // A provider that is TronLink's must not be listed again as an Ethereum wallet.
  const wallets = [...announcedEvm.values()].filter(
    (wallet) => !tronWallets.some((tron) => tron.provider === wallet.provider)
  );
  const ethereum = host.ethereum as (Eip1193Provider & { providers?: unknown }) | undefined;
  if (isProvider(ethereum)) {
    const list: unknown[] =
      Array.isArray(ethereum.providers) && ethereum.providers.length > 0 ? ethereum.providers : [ethereum];
    list.filter(isProvider).forEach((provider, index) => {
      const known = [...wallets, ...tronWallets].some((wallet) => wallet.provider === provider);
      if (!known) {
        wallets.push({ id: `injected-${index}`, name: legacyName(provider), kind: 'evm', provider });
      }
    });
  }
  return [...wallets, ...tronWallets];
}

/** An account from an `eth_accounts`-style answer, as `0x` and 40 lowercase hex characters. */
function evmAccountOf(raw: unknown): string | null {
  return typeof raw === 'string' && /^0x[0-9a-fA-F]{40}$/.test(raw) ? raw.toLowerCase() : null;
}

/**
 * Let this site in with TronLink, then read the TRON account. TronLink's documented authorization is
 * `eth_requestAccounts` on its provider (`window.tron`): the person approves the site, and `tronWeb`
 * then holds the TRON account (`false` until then). The address that request answers is an Ethereum
 * `0x` account, so it is not read. `tron_requestAccounts` is the legacy method, which the TRON
 * provider answers with 4200, so it is not used.
 */
async function requestTronAccount(provider: TronLinkProvider): Promise<string | null> {
  try {
    await provider.request({ method: 'eth_requestAccounts' });
  } catch (error) {
    if ((error as { code?: number } | null)?.code === 4200) {
      throw new Error('TronLink is too old for this site: update TronLink');
    }
    throw error;
  }
  if (!provider.tronWeb) {
    throw new Error('TronLink has not let this site in: unlock TronLink, allow this site, and try again');
  }
  return tronAccountOf(provider.tronWeb.defaultAddress?.base58);
}

/**
 * Ask a wallet to share its account (the wallet shows its own prompt) and return a signer for it.
 * Rejects when the user says no (the provider's error, code 4001) or when no account is shared.
 */
export async function connectWallet(wallet: InjectedWallet): Promise<Signer> {
  if (wallet.kind === 'tron') {
    const account = await requestTronAccount(wallet.provider as TronLinkProvider);
    if (!account) {
      throw new Error('the wallet did not share an account');
    }
    return createTronLinkSigner(wallet.provider as TronLinkProvider, account);
  }
  const accounts = await wallet.provider.request({ method: 'eth_requestAccounts' });
  const account = evmAccountOf(Array.isArray(accounts) ? accounts[0] : undefined);
  if (!account) {
    throw new Error('the wallet did not share an account');
  }
  return createWalletSigner(wallet.provider, account);
}

/** A signer for `account` on `wallet`: `personal_sign` for MetaMask and Trust Wallet, `signMessageV2` for TronLink. */
export function createSignerFor(wallet: InjectedWallet, account: string): Signer {
  return wallet.kind === 'tron'
    ? createTronLinkSigner(wallet.provider as TronLinkProvider, account)
    : createWalletSigner(wallet.provider, account);
}

/** The first account in an answer of this wallet (`accountsChanged`), as a Clutch address; `null` when there is none. */
export function walletAccountFrom(wallet: InjectedWallet, accounts: unknown): string | null {
  const first = Array.isArray(accounts) ? accounts[0] : undefined;
  return wallet.kind === 'tron' ? tronAccountOf(first) : evmAccountOf(first);
}

/**
 * The account a wallet already shares with this page, as a Clutch address. It never opens a
 * prompt, so an app can use it to connect again by itself on the next visit. `null` when the wallet
 * shares none (locked, or the site was never allowed). A TronLink that allowed the site earlier has
 * its `tronWeb` ready; one that did not has `tronWeb` `false`.
 */
export async function sharedWalletAccount(wallet: InjectedWallet): Promise<string | null> {
  if (wallet.kind === 'tron') {
    const tronWeb = (wallet.provider as TronLinkProvider).tronWeb;
    return !tronWeb || tronWeb.ready === false ? null : tronAccountOf(tronWeb.defaultAddress?.base58);
  }
  return walletAccountFrom(wallet, await wallet.provider.request({ method: 'eth_accounts' }));
}

/**
 * Call `listener` with the new account (a Clutch address) when the person switches account in the
 * wallet, and with `null` when the wallet stops sharing this site (locked, or disconnected).
 * Returns a function that stops listening.
 */
export function watchWalletAccounts(wallet: InjectedWallet, listener: (account: string | null) => void): () => void {
  const provider = wallet.provider;
  if (!provider.on) {
    return () => {};
  }
  const onAccountsChanged = (accounts: unknown): void => listener(walletAccountFrom(wallet, accounts));
  provider.on('accountsChanged', onAccountsChanged);
  return () => {
    provider.removeListener?.('accountsChanged', onAccountsChanged);
  };
}
