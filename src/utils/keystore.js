/**
 * Passphrase-encrypted wallet backup.
 *
 * The app keeps its private key in plaintext `localStorage` (see KeyStorageNotice), which means
 * clearing site data destroys it and there is no second copy anywhere. A backup fixes that — but a
 * backup is a file that leaves the browser, so it must not be the same plaintext key with a
 * filename on it. This app is the reference implementation; the storage pattern people copy out of
 * it should be one worth copying.
 *
 * So: PBKDF2-SHA256 to stretch the passphrase, AES-GCM to seal the key. Both are in WebCrypto, so
 * this adds no dependency and no hand-rolled crypto.
 *
 * Deliberately NOT the Ethereum keystore v3 format. v3 wants scrypt, which WebCrypto does not
 * provide, and a file that looks like v3 but is not would be worse than one that never claimed to
 * be — some tool would half-read it. `format` says plainly what this is.
 */
// Explicit extension, unlike the rest of this app: Vite resolves either, plain Node ESM resolves
// only this one, and that is what lets keystore.test.js run under `node --test` with no bundler.
import { addressFromPrivateKey } from './wallet.js';

export const KEYSTORE_FORMAT = 'clutch-keystore-1';

/** OWASP's floor for PBKDF2-SHA256, and the same count the treasury's backup script uses. */
const PBKDF2_ITERATIONS = 600000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64(bytes) {
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

function fromBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function subtle() {
  const crypto = globalThis.crypto;
  if (!crypto?.subtle) {
    // Browsers expose WebCrypto only on a secure origin. Over plain HTTP on anything but
    // localhost, crypto.subtle is simply absent -- so say that, rather than let the caller
    // report "undefined is not a function" to a user who has done nothing wrong.
    throw new Error('Encrypted backups need a secure page (https, or localhost). This page is not one.');
  }
  return crypto.subtle;
}

async function deriveKey(passphrase, salt) {
  const material = await subtle().importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Seal a private key under a passphrase.
 *
 * The address travels in plaintext on purpose: it is public, and it lets someone with several
 * backup files tell them apart without typing a passphrase into each one.
 *
 * @param {{ address: string, privateKey: string }} wallet
 * @param {string} passphrase
 * @returns {Promise<object>} the keystore, ready for JSON.stringify
 */
export async function encryptWallet({ address, privateKey }, passphrase) {
  if (!privateKey) throw new Error('No private key to back up.');
  if (!passphrase) throw new Error('A passphrase is required.');

  const salt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(passphrase, salt);
  const ciphertext = await subtle().encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(privateKey));

  return {
    format: KEYSTORE_FORMAT,
    address,
    createdAt: new Date().toISOString(),
    kdf: {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: PBKDF2_ITERATIONS,
      salt: toBase64(salt),
    },
    cipher: { name: 'AES-GCM', iv: toBase64(iv) },
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
}

/**
 * Open a keystore.
 *
 * Two checks, for two different failures. AES-GCM is authenticated, so a wrong passphrase or a
 * corrupted ciphertext fails to decrypt at all — that is the common case and it gets a plain
 * message rather than a DOMException.
 *
 * The second check is the one worth explaining: the `address` field is outside the sealed envelope,
 * so anyone can edit it. A file could therefore claim an address whose key it does not hold, and a
 * user restoring it would see the address they expected and wonder later why nothing they sign is
 * accepted. Deriving the address from the key that came out and comparing costs one scalar
 * multiplication and removes that entirely.
 *
 * @param {object} keystore parsed JSON
 * @param {string} passphrase
 * @returns {Promise<{ address: string, privateKey: string }>}
 */
export async function decryptWallet(keystore, passphrase) {
  if (!keystore || typeof keystore !== 'object') throw new Error('That file is not a Clutch backup.');
  if (keystore.format !== KEYSTORE_FORMAT) {
    throw new Error(`Unrecognised backup format${keystore.format ? ` (${keystore.format})` : ''}.`);
  }
  if (!keystore.ciphertext || !keystore.kdf?.salt || !keystore.cipher?.iv) {
    throw new Error('That backup is missing fields and cannot be opened.');
  }
  if (!passphrase) throw new Error('A passphrase is required.');

  const iterations = Number(keystore.kdf.iterations);
  if (!Number.isFinite(iterations) || iterations < 1) throw new Error('That backup has an invalid iteration count.');

  const material = await subtle().importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  const key = await subtle().deriveKey(
    {
      name: 'PBKDF2',
      salt: fromBase64(keystore.kdf.salt),
      iterations,
      hash: keystore.kdf.hash || 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );

  let plaintext;
  try {
    plaintext = await subtle().decrypt(
      { name: 'AES-GCM', iv: fromBase64(keystore.cipher.iv) },
      key,
      fromBase64(keystore.ciphertext),
    );
  } catch {
    throw new Error('Wrong passphrase, or the file has been altered.');
  }

  const privateKey = decoder.decode(plaintext);

  let derived;
  try {
    derived = addressFromPrivateKey(privateKey);
  } catch {
    throw new Error('That backup decrypted, but what came out is not a private key.');
  }

  if (keystore.address && derived.toLowerCase() !== String(keystore.address).toLowerCase()) {
    throw new Error(
      `That backup names ${keystore.address} but holds the key for ${derived}. Refusing to restore it.`,
    );
  }

  return { address: derived, privateKey };
}

/** Filename for a backup. The address makes several of them tellable apart in a downloads folder. */
export function backupFilename(role, address) {
  const short = address ? address.slice(2, 10) : 'wallet';
  return `clutch-${role || 'wallet'}-${short}.json`;
}
