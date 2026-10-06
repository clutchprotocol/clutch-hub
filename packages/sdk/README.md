# clutch-hub-sdk-js

![Alpha](https://img.shields.io/badge/status-alpha-orange.svg)
![Experimental](https://img.shields.io/badge/stage-experimental-red.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)
[![npm](https://img.shields.io/npm/v/clutch-hub-sdk-js.svg)](https://www.npmjs.com/package/clutch-hub-sdk-js)

> ⚠️ **ALPHA SOFTWARE** — APIs may change without notice.

JavaScript/TypeScript SDK for the Clutch Hub API and Clutch blockchain.

**Documentation:** https://docs.clutchprotocol.io/clutch-hub-sdk-js/overview

## Install

```bash
npm install clutch-hub-sdk-js
```

## Usage

```javascript
import { ClutchHubSdk } from 'clutch-hub-sdk-js';

// privateKey is needed for authenticated calls: generateToken requires a signed
// proof-of-key-ownership challenge (the key stays local, it is never sent).
// chainId comes from your own config, never from the hub. The optional fifth argument
// sets the HTTP timeout (default 30 s; 0 disables it).
const sdk = new ClutchHubSdk('http://localhost:3000', publicKey, privateKey, 2077, { timeoutMs: 30_000 });

// Create, sign, and submit a ride request. Amounts are bigint: 1 USD = 1,000,000 CLT.
const unsigned = await sdk.createUnsignedRideRequest({
  pickup: { latitude: 35.7, longitude: 51.4 },
  dropoff: { latitude: 35.8, longitude: 51.5 },
  fare: 5_000_000n,
});
const signed = await sdk.signTransaction(unsigned, privateKey, { type: 'RideRequest', fare: 5_000_000n });
await sdk.submitTransaction(signed.rawTransaction);
```

Hash arguments (`listRideOffers`, `subscribeRideOffers`) accept the `0x`-prefixed form that `signTransaction` returns; the SDK normalizes them to the form the hub matches on.

## Wallets: MetaMask, Trust Wallet, TronLink

A wallet keeps the key and signs a short text. MetaMask and Trust Wallet sign it with `personal_sign` (EIP-191). TronLink signs it with `signMessageV2` (TIP-191), which is the same with the prefix `\x19TRON Signed Message:\n`. A TronLink account is the same kind of key as a Clutch account, so its `T…` address is the Clutch address `0x…` of the same key. Use a signer where you used a key:

```javascript
import { ClutchHubSdk, discoverInjectedWallets, connectWallet } from 'clutch-hub-sdk-js';

const [wallet] = await discoverInjectedWallets();   // EIP-6963 and TIP-6963 (TronLink), then window.ethereum / window.tron
const signer = await connectWallet(wallet);          // the wallet asks the user to share an account

const sdk = new ClutchHubSdk('http://localhost:3000', signer.address, signer, 2077);
// ... create the unsigned transaction as above ...
const signed = await sdk.signTransaction(unsigned, signer, { type: 'RideRequest', fare: 5_000_000n });
```

Each `signTransaction` and each login opens a prompt in the wallet. The text the wallet shows is `clutch-tx:{chainId}:{hash}` for a transaction and `clutch-auth:{chainId}:{address}:{timestamp}` for the login. The node and the Hub API accept this signature next to the signature of a private key. `wallet.kind` is `'evm'` (MetaMask, Trust Wallet) or `'tron'` (TronLink), and `connectWallet`, `createSignerFor(wallet, account)`, `sharedWalletAccount(wallet)` (the account a wallet already shares, with no prompt) and `watchWalletAccounts(wallet, listener)` work for both. `createWalletSigner(provider, address)` and `createTronLinkSigner(provider, address)` build a signer for a provider you already have, and `createLocalSigner(privateKey)` wraps a key. A user who says no in a wallet gives a rejection (MetaMask and Trust Wallet: `code: 4001`; TronLink: an error with the message `user rejected request`).

## Features

- Client-side signing (private keys never sent to server), or a wallet that keeps the key (MetaMask, Trust Wallet, TronLink)
- Full ride lifecycle: request, offer, accept, pay, cancel
- GraphQL queries and WebSocket subscriptions
- TypeScript types

## API methods

| Category | Methods |
|----------|---------|
| Auth | Auto `generateToken` via `ensureAuth()` (signed challenge; needs a private key or a signer), `setPrivateKey`, `setSigner`, `signAuthChallenge` |
| Signers | `createLocalSigner`, `createWalletSigner`, `createTronLinkSigner`, `createSignerFor`, `discoverInjectedWallets`, `connectWallet`, `sharedWalletAccount`, `watchWalletAccounts`, `tronAddressToHex`, `addressFromPrivateKey` |
| Write | `createUnsignedRide*`, `signTransaction`, `submitTransaction` |
| Read | `listRideRequests`, `listRideOffers`, `listActiveTrips`, `getAccountBalance`, … |
| Live | `subscribeRideRequests`, `subscribeRideOffers`, `subscribeActiveTrips`, … |

Full reference: https://docs.clutchprotocol.io/clutch-hub-sdk-js/api-reference

## Security

**Never expose private keys.** Client-side signing only. See [Security](https://docs.clutchprotocol.io/reference/security).

## Releases

Uses [semantic-release](https://semantic-release.gitbook.io/) with conventional commits.

**Created and maintained by [Mehran Mazhar](https://github.com/MehranMazhar)**
