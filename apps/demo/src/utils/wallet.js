/**
 * Wallet generation utilities for Clutch Protocol.
 * Uses secp256k1 (same as Ethereum/Clutch node) for key derivation.
 */
import * as secp from '@noble/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

/**
 * The address a private key controls.
 *
 * Split out of `generateWallet` because restoring a backup has to answer the same question: a
 * keystore file names an address in plaintext, and the only way to know that name is honest is to
 * derive it from the key that came out of the envelope and compare.
 *
 * Matches the derivation used by clutch-hub-api (signature_keys.rs): keccak256 of the
 * uncompressed public key without its 0x04 prefix, last 20 bytes.
 *
 * @param {string} privateKey hex, with or without the 0x prefix
 * @returns {string} address, 0x-prefixed
 */
export function addressFromPrivateKey(privateKey) {
  const hex = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;
  const publicKeyBytes = secp.getPublicKey(hexToBytes(hex), false);
  const hash = keccak_256(publicKeyBytes.slice(1));
  return '0x' + bytesToHex(hash.slice(12, 32));
}

/**
 * Generates a new Clutch-compatible keypair.
 * Returns address (Ethereum-style) and private key in hex.
 *
 * @returns {{ address: string, privateKey: string }}
 */
export function generateWallet() {
  const privateKeyBytes = secp.utils.randomPrivateKey();
  const privateKey = '0x' + bytesToHex(privateKeyBytes);

  return {
    address: addressFromPrivateKey(privateKey),
    privateKey,
  };
}
