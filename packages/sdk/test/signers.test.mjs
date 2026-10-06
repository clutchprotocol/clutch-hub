// Runs against dist/ — `npm run build` first. `node --test test/` (Node >= 20, no framework).
//
// A wallet signs with `personal_sign` (EIP-191), not over a bare hash. These tests stand a fake
// wallet next to the SDK. The fake is written here, from the standard, the way MetaMask does it,
// and not from the SDK's own code; and two signatures are pinned that the node's and the Hub API's
// Rust tests also pin (`a_signature_made_by_a_javascript_library_verifies`,
// `javascript_wallet_fixture_verifies`), so a change on one side cannot pass quietly.
//
// TronLink signs with `signMessageV2` (TIP-191): the same, with the prefix "\x19TRON Signed
// Message:\n". The second half of this file stands a fake TronLink next to the SDK, written from
// TronLink's documentation, and pins two signatures that TronWeb 6.5.1 itself made. The Rust tests
// pin the same two (`a_signature_tronweb_made_verifies`, `tronweb_fixture_verifies`).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as rlp from 'rlp';
import * as secp from '@noble/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import {
  ClutchHubSdk,
  addressFromPrivateKey,
  connectWallet,
  createLocalSigner,
  createSignerFor,
  createTronLinkSigner,
  createWalletSigner,
  discoverInjectedWallets,
  personalSignDigest,
  sharedWalletAccount,
  tronAddressToHex,
  tronSignDigest,
  walletAccountFrom,
  walletTransactionText,
  watchWalletAccounts,
} from '../dist/index.js';

// The committed dev key used across the repo, and its address.
const DEV_KEY = 'd2c446110cfcecbdf05b2be528e72483de5b6f7ef9c7856df2f81f48e9f2748f';
const DEV_ADDRESS = '0xdeb4cfb63db134698e1879ea24904df074726cc0';
const OTHER_KEY = '0883ddd3d07303b87c954b0c9383f7b78f45e002520fc03a8adc80595dbf6509';

const hex = (bytes) => Buffer.from(bytes).toString('hex');
const utf8hex = (text) => '0x' + Buffer.from(text, 'utf8').toString('hex');

/** What `personal_sign` hashes: the EIP-191 prefix, the length in decimal, the text. */
function eip191Digest(text) {
  const body = Buffer.from(text, 'utf8');
  return keccak_256(Buffer.concat([Buffer.from(`\x19Ethereum Signed Message:\n${body.length}`), body]));
}

/** The address a signature over `digest` came from, worked out here with noble directly. */
function recover(digest, { r, s, v }) {
  const compact = r.replace(/^0x/, '') + s.replace(/^0x/, '');
  const point = secp.Signature.fromCompact(compact).addRecoveryBit(v - 27).recoverPublicKey(digest);
  return '0x' + hex(keccak_256(point.toRawBytes(false).slice(1)).slice(-20));
}

/**
 * A stand-in for MetaMask. The message arrives as 0x-hex of the text; the wallet puts the EIP-191
 * prefix in front, hashes it and signs with the account's key. `recoveryStyle: 'zero-one'` answers
 * with a recovery id of 0 or 1, as some wallets do.
 */
function fakeWallet({ key = DEV_KEY, accounts = [DEV_ADDRESS], recoveryStyle = 'ethereum' } = {}) {
  const calls = [];
  return {
    calls,
    async request({ method, params }) {
      calls.push({ method, params });
      if (method === 'eth_requestAccounts') return accounts;
      if (method === 'personal_sign') {
        const [message, from] = params;
        assert.match(message, /^0x[0-9a-f]*$/, 'the message must be hex');
        assert.equal(from, from.toLowerCase(), 'the account must be lower case');
        const sig = await secp.signAsync(eip191Digest(Buffer.from(message.slice(2), 'hex').toString('utf8')), key);
        const v = recoveryStyle === 'ethereum' ? sig.recovery + 27 : sig.recovery;
        return '0x' + sig.toCompactHex() + v.toString(16).padStart(2, '0');
      }
      throw new Error(`unsupported method ${method}`);
    },
  };
}

// --- the texts and the digest -------------------------------------------------------------

test('personalSignDigest is the published EIP-191 digest of "Hello World"', () => {
  // `hashMessage("Hello World")` from the ethers documentation.
  assert.equal(
    hex(personalSignDigest('Hello World')),
    'a1de988600a42c4b4ab089b619297c17d53cffae5d5120d82d8a92d0bb3b78f2'
  );
  assert.deepEqual(personalSignDigest('clutch-tx:1:ab'), eip191Digest('clutch-tx:1:ab'));
});

test('walletTransactionText names the chain and writes the hash bare, in lower case', () => {
  const hash = '6f1e0b5d3a9c4e7f8a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f';
  assert.equal(walletTransactionText(1000, hash), `clutch-tx:1000:${hash}`);
  assert.equal(walletTransactionText(1000, '0x' + hash.toUpperCase()), `clutch-tx:1000:${hash}`);
});

test('addressFromPrivateKey gives the known addresses', () => {
  assert.equal(
    addressFromPrivateKey('0000000000000000000000000000000000000000000000000000000000000001'),
    '0x7e5f4552091a69125d5dfcb7b8c2659029395bdf'
  );
  assert.equal(addressFromPrivateKey(DEV_KEY), DEV_ADDRESS);
  assert.equal(addressFromPrivateKey('0x' + DEV_KEY), DEV_ADDRESS);
  assert.equal(createLocalSigner(DEV_KEY).address, DEV_ADDRESS);
});

test('a bad private key fails when something is signed, not when the signer is made', async () => {
  const signer = createLocalSigner('not a key');
  await assert.rejects(signer.signTransaction({ hashHex: 'ab'.repeat(32), chainId: 1 }));
});

// --- the wallet signer ----------------------------------------------------------------------

test('a wallet signer signs a transaction as the node test vector does', async () => {
  const wallet = fakeWallet();
  // Mixed case on purpose: the signer lowercases the account.
  const signer = createWalletSigner(wallet, '0xDEB4cfb63db134698e1879ea24904df074726cc0');
  assert.equal(signer.address, DEV_ADDRESS);

  const hash = '6f1e0b5d3a9c4e7f8a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f';
  const signature = await signer.signTransaction({ hashHex: hash, chainId: 1000 });

  // The same signature the node's `a_signature_made_by_a_javascript_library_verifies` pins.
  assert.deepEqual(signature, {
    r: '0x03a910ef2c3144e635a9cd5dfb87d0f0a8e9cde11013b5fdbbd3098eb66ede07',
    s: '0x7270323fea8d69ffeedac84df538c026d630e027b4380686287350fcb8e03c91',
    v: 28,
  });
  // What the wallet was asked: the text as hex, and the account in lower case.
  assert.deepEqual(wallet.calls, [
    { method: 'personal_sign', params: [utf8hex(`clutch-tx:1000:${hash}`), DEV_ADDRESS] },
  ]);
});

test('a wallet signer signs the login message as the Hub API test vector does', async () => {
  const wallet = fakeWallet();
  const signer = createWalletSigner(wallet, DEV_ADDRESS);
  const message = `clutch-auth:1000:${DEV_ADDRESS}:1751500000`;
  const signature = await signer.signAuthChallenge({ message, hashHex: 'unused-by-a-wallet' });

  // The same signature the Hub API's `javascript_wallet_fixture_verifies` pins.
  assert.deepEqual(signature, {
    r: '0x816b7bceba6de8fdf488131628c271dac56a501a2e454491b267bc71e33f403c',
    s: '0x32f9ed592547b9878df0a3fdbf00229ca9baf5c71a88fa667895fb5b45d57578',
    v: 28,
  });
  assert.equal(wallet.calls[0].params[0], utf8hex(message), 'the wallet is shown the readable message');
});

test('a wallet that answers with a recovery id of 0 or 1 is read as 27 or 28', async () => {
  const wallet = fakeWallet({ recoveryStyle: 'zero-one' });
  const signer = createWalletSigner(wallet, DEV_ADDRESS);
  // Chain 2077: hash ...01 recovers with id 0, hash ...02 with id 1.
  const first = await signer.signTransaction({ hashHex: '0'.repeat(63) + '1', chainId: 2077 });
  const second = await signer.signTransaction({ hashHex: '0'.repeat(63) + '2', chainId: 2077 });
  assert.equal(first.v, 27);
  assert.equal(second.v, 28);
  assert.equal(first.r, '0x7206d9e313c72d8d1cb251d130240fd6b51d7b1ea784b8f55a81f4b611a07e59');
  assert.equal(second.r, '0x428f51c6216b609780b9285a54c691a2922039788c26801bea2a9b684ed747e5');
});

test('a wallet that signs with another account is refused before anything is sent', async () => {
  const wallet = fakeWallet({ key: OTHER_KEY });
  const signer = createWalletSigner(wallet, DEV_ADDRESS);
  await assert.rejects(
    signer.signTransaction({ hashHex: 'ab'.repeat(32), chainId: 2077 }),
    (error) => {
      assert.match(error.message, new RegExp(DEV_ADDRESS));
      assert.match(error.message, /switch/);
      return true;
    }
  );
});

test('an answer that is not 65 bytes of hex is refused', async () => {
  for (const answer of ['0x1234', undefined, 42, '0x' + 'zz'.repeat(65)]) {
    const signer = createWalletSigner({ request: async () => answer }, DEV_ADDRESS);
    await assert.rejects(signer.signTransaction({ hashHex: 'ab'.repeat(32), chainId: 2077 }), /cannot read/);
  }
});

test('a wallet that says no is passed through unchanged', async () => {
  const refusal = Object.assign(new Error('User rejected the request.'), { code: 4001 });
  const signer = createWalletSigner({ request: async () => { throw refusal; } }, DEV_ADDRESS);
  await assert.rejects(signer.signTransaction({ hashHex: 'ab'.repeat(32), chainId: 2077 }), { code: 4001 });
});

// --- the SDK with a wallet --------------------------------------------------------------------

const UNSIGNED = {
  from: DEV_ADDRESS,
  nonce: 1,
  chain_id: 2077,
  data: { function_call_type: 'Burn', arguments: { amount: '5000000', redemption_ref: 'a'.repeat(64) } },
};
const EXPECTED = { type: 'Burn', amount: 5000000n, redemptionRef: 'a'.repeat(64) };

/** The decoded signed transaction, and the hash it should carry. */
function decodeSigned(signed) {
  const [from, nonce, chainId, r, s, v, hash, data] = rlp.decode(Buffer.from(signed.rawTransaction.slice(2), 'hex'));
  const preimage = rlp.encode([Buffer.from(from).toString('utf8'), Number(BigInt('0x' + hex(nonce))), Number(BigInt('0x' + hex(chainId))), data]);
  return {
    hash: Buffer.from(hash).toString('utf8'),
    recomputed: hex(keccak_256(preimage)),
    sig: { r: Buffer.from(r).toString('utf8'), s: Buffer.from(s).toString('utf8'), v: Number(BigInt('0x' + hex(v))) },
  };
}

test('signTransaction with a wallet: the signature is the one a node checks', async () => {
  const sdk = new ClutchHubSdk('http://hub.test', DEV_ADDRESS, undefined, 2077);
  const signer = createWalletSigner(fakeWallet(), DEV_ADDRESS);
  const signed = await sdk.signTransaction(UNSIGNED, signer, EXPECTED);

  const { hash, recomputed, sig } = decodeSigned(signed);
  assert.equal(hash, recomputed, 'the hash on the wire is the hash of the unsigned transaction');
  assert.equal(signed.txHash, '0x' + hash);
  // What `Transaction::verify_signature` does for a wallet: EIP-191 over clutch-tx:{chain}:{hash}.
  const text = `clutch-tx:2077:${hash}`;
  assert.equal(recover(eip191Digest(text), { r: '0x' + sig.r, s: '0x' + sig.s, v: sig.v }), DEV_ADDRESS);
});

test('signTransaction with a key still signs the hash string, as before', async () => {
  const sdk = new ClutchHubSdk('http://hub.test', DEV_ADDRESS, undefined, 2077);
  const signed = await sdk.signTransaction(UNSIGNED, DEV_KEY, EXPECTED);

  const { hash, recomputed, sig } = decodeSigned(signed);
  assert.equal(hash, recomputed);
  // What `Transaction::verify_signature` does for a key: Keccak-256 of the hash string itself.
  const digest = keccak_256(Buffer.from(hash, 'utf8'));
  assert.equal(recover(digest, { r: '0x' + sig.r, s: '0x' + sig.s, v: sig.v }), DEV_ADDRESS);
  // And the wallet scheme does not hold for it: the two digests differ.
  assert.notEqual(recover(eip191Digest(`clutch-tx:2077:${hash}`), { r: '0x' + sig.r, s: '0x' + sig.s, v: sig.v }), DEV_ADDRESS);
});

test('a wallet signer logs in: the Hub API gets the signature of the readable challenge', async () => {
  // A fresh account, so that no cached token or signer from another test is in the way.
  const key = hex(secp.utils.randomPrivateKey());
  const address = addressFromPrivateKey(key);
  const wallet = fakeWallet({ key, accounts: [address] });
  const signer = createWalletSigner(wallet, address);

  const sdk = new ClutchHubSdk('http://hub.test', address, signer, 2077);
  const sent = [];
  sdk.apiClient.post = async (_url, body) => {
    sent.push(body);
    return { data: { data: { generateToken: { token: 'token', expiresAt: Math.floor(Date.now() / 1000) + 3600 } } } };
  };
  await sdk.ensureAuth();

  const { timestamp, signature } = sent[0].variables;
  const message = `clutch-auth:2077:${address}:${timestamp}`;
  assert.equal(wallet.calls.length, 1);
  assert.equal(wallet.calls[0].params[0], utf8hex(message), 'the wallet is shown the readable challenge');
  assert.equal(recover(eip191Digest(message), signature), address);
});

test('a key still logs in with the signature of the challenge hash', async () => {
  const key = hex(secp.utils.randomPrivateKey());
  const address = addressFromPrivateKey(key);
  const sdk = new ClutchHubSdk('http://hub.test', address, key, 2077);
  const sent = [];
  sdk.apiClient.post = async (_url, body) => {
    sent.push(body);
    return { data: { data: { generateToken: { token: 'token', expiresAt: Math.floor(Date.now() / 1000) + 3600 } } } };
  };
  await sdk.ensureAuth();

  const { timestamp, signature } = sent[0].variables;
  const challengeHash = hex(keccak_256(Buffer.from(`clutch-auth:2077:${address}:${timestamp}`, 'utf8')));
  assert.equal(recover(keccak_256(Buffer.from(challengeHash, 'utf8')), signature), address);
});

test('setSigner replaces the signer for the account', async () => {
  const key = hex(secp.utils.randomPrivateKey());
  const address = addressFromPrivateKey(key);
  const sdk = new ClutchHubSdk('http://hub.test', address, undefined, 2077);
  const wallet = fakeWallet({ key, accounts: [address] });
  sdk.setSigner(createWalletSigner(wallet, address));
  sdk.apiClient.post = async () => ({ data: { data: { generateToken: { token: 'token', expiresAt: Math.floor(Date.now() / 1000) + 3600 } } } });
  await sdk.ensureAuth();
  assert.equal(wallet.calls.length, 1);
});

const tokenReply = () => ({
  data: { data: { generateToken: { token: 'token', expiresAt: Math.floor(Date.now() / 1000) + 3600 } } },
});

test('the shared socket never asks a wallet to sign in the background', async () => {
  const key = hex(secp.utils.randomPrivateKey());
  const address = addressFromPrivateKey(key);
  const wallet = fakeWallet({ key, accounts: [address] });
  const sdk = new ClutchHubSdk('http://hub.test', address, createWalletSigner(wallet, address), 2077);
  let posts = 0;
  sdk.apiClient.post = async () => {
    posts += 1;
    return tokenReply();
  };

  // A reconnect with no token: the subscriptions are public, so it goes without one, and no prompt opens.
  assert.deepEqual(await sdk.wsConnectionParams(), {});
  assert.equal(wallet.calls.length, 0);
  assert.equal(posts, 0);

  // Once the app has signed in on purpose, the token is sent and nothing new is asked.
  await sdk.ensureAuth();
  assert.equal(wallet.calls.length, 1);
  assert.deepEqual(await sdk.wsConnectionParams(), { Authorization: 'Bearer token' });
  assert.equal(wallet.calls.length, 1);
});

test('the shared socket still signs in with a key, silently, as before', async () => {
  const key = hex(secp.utils.randomPrivateKey());
  const address = addressFromPrivateKey(key);
  const sdk = new ClutchHubSdk('http://hub.test', address, key, 2077);
  let posts = 0;
  sdk.apiClient.post = async () => {
    posts += 1;
    return tokenReply();
  };
  assert.deepEqual(await sdk.wsConnectionParams(), { Authorization: 'Bearer token' });
  assert.equal(posts, 1);
});

test('hasValidToken is true once the account has signed in, for every instance of it', async () => {
  const key = hex(secp.utils.randomPrivateKey());
  const address = addressFromPrivateKey(key);
  const first = new ClutchHubSdk('http://hub.test', address, createWalletSigner(fakeWallet({ key, accounts: [address] }), address), 2077);
  const second = new ClutchHubSdk('http://hub.test', address, undefined, 2077);
  first.apiClient.post = async () => tokenReply();

  assert.equal(first.hasValidToken(), false);
  assert.equal(second.hasValidToken(), false);
  await first.ensureAuth();
  assert.equal(first.hasValidToken(), true);
  assert.equal(second.hasValidToken(), true, 'the token is shared, so another instance needs no prompt either');
});

test('the shared socket sends nothing, and does not throw, when there is no signer', async () => {
  const address = addressFromPrivateKey(hex(secp.utils.randomPrivateKey()));
  const sdk = new ClutchHubSdk('http://hub.test', address, undefined, 2077);
  assert.deepEqual(await sdk.wsConnectionParams(), {});
});

test('login without any key or signer says what is missing', async () => {
  const address = addressFromPrivateKey(hex(secp.utils.randomPrivateKey()));
  const sdk = new ClutchHubSdk('http://hub.test', address, undefined, 2077);
  await assert.rejects(sdk.ensureAuth(), /proof of key ownership.*signer/s);
});

// --- finding a wallet --------------------------------------------------------------------------

/**
 * A page with wallets that announce themselves (EIP-6963 for Ethereum wallets, TIP-6963 for TRON
 * ones), and perhaps a `window.ethereum`, `window.tron` or `window.tronLink`.
 */
function fakePage({ announced = [], tipAnnounced = [], ethereum, tron, tronLink } = {}) {
  const page = new EventTarget();
  page.ethereum = ethereum;
  page.tron = tron;
  page.tronLink = tronLink;
  page.addEventListener('eip6963:requestProvider', () => {
    for (const { info, provider } of announced) {
      page.dispatchEvent(Object.assign(new Event('eip6963:announceProvider'), { detail: { info, provider } }));
    }
  });
  page.addEventListener('TIP6963:requestProvider', () => {
    for (const { info, provider } of tipAnnounced) {
      page.dispatchEvent(Object.assign(new Event('TIP6963:announceProvider'), { detail: { info, provider } }));
    }
  });
  return page;
}

const provider = (flags = {}) => ({ request: async () => null, ...flags });

test('discoverInjectedWallets lists the wallets that announce themselves (EIP-6963)', async () => {
  const metamask = provider();
  const trust = provider();
  const page = fakePage({
    announced: [
      { info: { uuid: 'u1', name: 'MetaMask', icon: 'data:image/png;base64,AA', rdns: 'io.metamask' }, provider: metamask },
      { info: { uuid: 'u2', name: 'Trust Wallet', icon: 'data:image/png;base64,BB', rdns: 'com.trustwallet.app' }, provider: trust },
    ],
  });
  const wallets = await discoverInjectedWallets({ host: page, timeoutMs: 5 });
  assert.deepEqual(wallets.map((w) => [w.id, w.name]), [['io.metamask', 'MetaMask'], ['com.trustwallet.app', 'Trust Wallet']]);
  assert.equal(wallets[0].provider, metamask);
  assert.equal(wallets[0].icon, 'data:image/png;base64,AA');
});

test('discoverInjectedWallets adds a bare window.ethereum, named by what it says it is', async () => {
  const wallets = await discoverInjectedWallets({
    host: fakePage({ ethereum: provider({ isMetaMask: true, isTrust: true }) }),
    timeoutMs: 5,
  });
  // Trust Wallet sets isMetaMask too, so Trust is checked first.
  assert.deepEqual(wallets.map((w) => [w.id, w.name]), [['injected-0', 'Trust Wallet']]);
});

test('discoverInjectedWallets lists a wallet once when it announces and sets window.ethereum', async () => {
  const metamask = provider({ isMetaMask: true });
  const page = fakePage({
    announced: [{ info: { uuid: 'u1', name: 'MetaMask', rdns: 'io.metamask' }, provider: metamask }],
    ethereum: metamask,
  });
  const wallets = await discoverInjectedWallets({ host: page, timeoutMs: 5 });
  assert.deepEqual(wallets.map((w) => w.id), ['io.metamask']);
});

test('discoverInjectedWallets lists every provider when window.ethereum holds several', async () => {
  const page = fakePage({
    ethereum: { ...provider(), providers: [provider({ isMetaMask: true }), provider({ isCoinbaseWallet: true })] },
  });
  const wallets = await discoverInjectedWallets({ host: page, timeoutMs: 5 });
  assert.deepEqual(wallets.map((w) => w.name), ['MetaMask', 'Coinbase Wallet']);
});

test('discoverInjectedWallets finds nothing when there is no wallet, and nothing outside a page', async () => {
  assert.deepEqual(await discoverInjectedWallets({ host: fakePage(), timeoutMs: 5 }), []);
  assert.deepEqual(await discoverInjectedWallets({ host: fakePage({ ethereum: {} }), timeoutMs: 5 }), []);
  assert.deepEqual(await discoverInjectedWallets(), []); // Node: no window
});

test('connectWallet asks for the account and returns a signer for it, in lower case', async () => {
  const wallet = fakeWallet({ accounts: ['0xDEB4cfb63db134698e1879ea24904df074726cc0'] });
  const signer = await connectWallet({ id: 'io.metamask', name: 'MetaMask', provider: wallet });
  assert.equal(signer.address, DEV_ADDRESS);
  assert.equal(wallet.calls[0].method, 'eth_requestAccounts');
});

test('connectWallet refuses an answer with no account', async () => {
  for (const accounts of [[], null, ['nope']]) {
    await assert.rejects(
      connectWallet({ id: 'x', name: 'X', provider: { request: async () => accounts } }),
      /did not share an account/
    );
  }
});

// --- TronLink -----------------------------------------------------------------------------------

// The dev key's TRON address, as TronWeb writes it, and the one TronLink's documentation shows (key 1).
const DEV_BASE58 = 'TWGmce4sb65jzLEr2qiwA42ntizH66cmXp';
const KEY1_BASE58 = 'TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC';
const KEY1_ADDRESS = '0x7e5f4552091a69125d5dfcb7b8c2659029395bdf';

// Two signatures made by TronWeb 6.5.1 (`trx.signMessageV2(text, devKey)`), the library TronLink wraps.
const TX_HASH = '6f1e0b5d3a9c4e7f8a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f';
const TRONWEB_TX_SIGNATURE = {
  r: '0x7f43dd8cb6b4ef174aa0da23faee41757521efcccd9a588052457f397e067494',
  s: '0x41afed3dd9a654e351b37ebaccad69a3f94b07926d19896a67b5621517f1063d',
  v: 27,
};
const AUTH_MESSAGE = `clutch-auth:1000:${DEV_ADDRESS}:1751500000`;
const TRONWEB_AUTH_SIGNATURE = {
  r: '0xbdb280546a1b7955be7ee2a31883f628a132e0b111af2b8f101ff2ee02f68972',
  s: '0x5a80d3c656f7ae0b5571bf70fbfad550863ecc445d4402579ea32b271c92659f',
  v: 28,
};

/** What TIP-191 hashes, worked out here with noble directly. It takes bytes, as the library does. */
function tipDigest(bytes) {
  const body = Buffer.from(bytes);
  return keccak_256(Buffer.concat([Buffer.from(`\x19TRON Signed Message:\n${body.length}`), body]));
}
const isHexString = (text) => /^0x(?:[0-9a-fA-F]{2})*$/.test(text);

/**
 * A stand-in for TronLink, written from its documentation. `style` is what `signMessageV2` does
 * with the string it gets (the documentation is not clear, so each reading is a style):
 *   'plain-or-hex'  plain text is signed as UTF-8; a 0x hex string is decoded and its bytes are signed
 *   'hex-only'      plain text is refused with "Invalid transaction provided"; a hex string is decoded
 *   'hex-as-text'   plain text is refused like that, and a hex string is signed as the TEXT of the string
 * `legacy` is an older TronLink: it does not know `eth_requestAccounts`. `tronWeb` is `false` until
 * the person lets the site in, as the documentation says.
 */
function fakeTronLink({
  key = DEV_KEY,
  account = DEV_BASE58,
  style = 'plain-or-hex',
  legacy = false,
  authorized = false,
  rejectConnect = false,
  rejectSign = false,
} = {}) {
  const requests = [];
  const signed = [];
  const tronWeb = {
    ready: true,
    defaultAddress: { base58: account },
    trx: {
      async signMessageV2(message) {
        signed.push(message);
        if (rejectSign) throw new Error('user rejected request'); // TronLink gives no code here
        let bytes;
        if (isHexString(message)) {
          bytes = style === 'hex-as-text' ? Buffer.from(message, 'utf8') : Buffer.from(message.slice(2), 'hex');
        } else if (style === 'plain-or-hex') {
          bytes = Buffer.from(message, 'utf8');
        } else {
          throw new Error('Invalid transaction provided');
        }
        const sig = await secp.signAsync(tipDigest(bytes), key);
        return '0x' + sig.toCompactHex() + (sig.recovery + 27).toString(16);
      },
    },
  };
  const listeners = new Map();
  const provider = {
    requests,
    signed,
    tronWeb: authorized ? tronWeb : false,
    async request({ method }) {
      requests.push(method);
      if (method === 'eth_requestAccounts' && !legacy) {
        if (rejectConnect) throw Object.assign(new Error('User rejected the request.'), { code: 4001 });
        provider.tronWeb = tronWeb;
        return [account];
      }
      if (method === 'eth_requestAccounts') {
        throw Object.assign(new Error('Method not supported'), { code: 4200 });
      }
      if (method === 'tron_requestAccounts' && legacy) {
        if (rejectConnect) return { code: 4001, message: 'rejected' };
        provider.tronWeb = tronWeb;
        return { code: 200, message: 'ok' };
      }
      throw new Error(`unsupported method ${method}`);
    },
    on(event, listener) {
      listeners.set(event, [...(listeners.get(event) ?? []), listener]);
    },
    removeListener(event, listener) {
      listeners.set(event, (listeners.get(event) ?? []).filter((l) => l !== listener));
    },
    emit(event, ...args) {
      (listeners.get(event) ?? []).forEach((listener) => listener(...args));
    },
    listenerCount: (event) => (listeners.get(event) ?? []).length,
  };
  return provider;
}

const tronWallet = (provider) => ({ id: 'org.tronlink.www', name: 'TronLink', kind: 'tron', provider });

test('tronSignDigest is the digest TronWeb signs: its own signatures recover to the dev account', () => {
  const text = `clutch-tx:1000:${TX_HASH}`;
  assert.equal(recover(tronSignDigest(text), TRONWEB_TX_SIGNATURE), DEV_ADDRESS);
  assert.equal(recover(tronSignDigest(AUTH_MESSAGE), TRONWEB_AUTH_SIGNATURE), DEV_ADDRESS);
  // The same function as the independent one above, and not the Ethereum digest.
  assert.deepEqual(tronSignDigest(text), tipDigest(Buffer.from(text)));
  assert.notEqual(recover(personalSignDigest(text), TRONWEB_TX_SIGNATURE), DEV_ADDRESS);
});

test('tronAddressToHex turns a TRON address into the Clutch address of the same key', () => {
  // Each expected value comes from TronWeb's own `address.toHex`, less its 0x41 prefix.
  const known = {
    [DEV_BASE58]: DEV_ADDRESS,
    [KEY1_BASE58]: KEY1_ADDRESS,
    TZ5XixnRyraxJJy996Q1sip85PHWuj4793: '0xfd7d047d1164aad0f6c1ea4966449cd2e34df696',
    TRKb2nAnCBfwxnLxgoKJro6VbyA6QmsuXq: '0xa864986e2983ba4aeebe02df656d7208f1bb3f14',
    TN9RRaXkCFtTXRso2GdTZxSxxwufzxLQPP: '0x859009fd225692b11237a6ffd8fdba2eb7140cca',
    TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t: '0xa614f803b6fd780986a42c78ec9c7f77e6ded13c',
  };
  for (const [base58, address] of Object.entries(known)) {
    assert.equal(tronAddressToHex(base58), address, base58);
  }
  // The key 1 address also matches what the SDK works out from the key itself.
  assert.equal(KEY1_ADDRESS, addressFromPrivateKey('0000000000000000000000000000000000000000000000000000000000000001'));
  // The other forms of the same address are taken as they are.
  assert.equal(tronAddressToHex('41DEB4CFB63DB134698E1879EA24904DF074726CC0'), DEV_ADDRESS);
  assert.equal(tronAddressToHex('0xDEB4cfb63db134698e1879ea24904df074726cc0'), DEV_ADDRESS);
});

test('tronAddressToHex refuses what is not a TRON address', () => {
  const bad = [
    'TWGmce4sb65jzLEr2qiwA42ntizH66cmXq', // the last character changed: the checksum fails
    'TWGmce4sb65jzLEr2qiwA42ntizH66cmX', // too short
    'TWGmce4sb65jzLEr2qiwA42ntizH66cmXpp', // too long
    'TWGmce4sb65jzLEr2qiwA42ntizH66cmX0', // "0" is not base58
    'T', // no payload
    '', // nothing
    '0x1234', // a hex address of the wrong length
    '1111111111111111111111111', // 25 bytes, which is the right length, but they do not start with 0x41
    '1111111111111111111111111111111111', // 34 bytes
  ];
  for (const address of bad) {
    assert.throws(() => tronAddressToHex(address), /not a TRON address|not a base58 character/, JSON.stringify(address));
  }
});

test('a TronLink signer signs a transaction as the node test vector does', async () => {
  const tron = fakeTronLink({ authorized: true });
  // The base58 address TronLink shows is taken, and the signer works in the Clutch form.
  const signer = createTronLinkSigner(tron, DEV_BASE58);
  assert.equal(signer.address, DEV_ADDRESS);
  assert.equal(signer.interactive, true);

  const signature = await signer.signTransaction({ hashHex: TX_HASH, chainId: 1000 });
  // The same signature TronWeb made, and the node's `a_signature_tronweb_made_verifies` pins.
  assert.deepEqual(signature, TRONWEB_TX_SIGNATURE);
  // One prompt, with the readable text in plain form.
  assert.deepEqual(tron.signed, [`clutch-tx:1000:${TX_HASH}`]);
});

test('a TronLink signer signs the login message as the Hub API test vector does', async () => {
  const tron = fakeTronLink({ authorized: true });
  const signer = createTronLinkSigner(tron, DEV_ADDRESS);
  const signature = await signer.signAuthChallenge({ message: AUTH_MESSAGE, hashHex: 'unused-by-a-wallet' });

  // The same signature TronWeb made, and the Hub API's `tronweb_fixture_verifies` pins.
  assert.deepEqual(signature, TRONWEB_AUTH_SIGNATURE);
  assert.deepEqual(tron.signed, [AUTH_MESSAGE], 'TronLink is shown the readable message');
});

test('a TronLink that takes only hex is asked again, in hex, and gives the same signature', async () => {
  const tron = fakeTronLink({ authorized: true, style: 'hex-only' });
  const signer = createTronLinkSigner(tron, DEV_ADDRESS);
  const text = `clutch-tx:1000:${TX_HASH}`;
  const signature = await signer.signTransaction({ hashHex: TX_HASH, chainId: 1000 });

  assert.deepEqual(signature, TRONWEB_TX_SIGNATURE);
  assert.deepEqual(tron.signed, [text, utf8hex(text)], 'plain first, then the 0x hex of the same text');
});

test('a TronLink that says no is passed through, and is not asked again', async () => {
  const tron = fakeTronLink({ authorized: true, rejectSign: true });
  const signer = createTronLinkSigner(tron, DEV_ADDRESS);
  await assert.rejects(signer.signTransaction({ hashHex: TX_HASH, chainId: 1000 }), /user rejected request/);
  assert.equal(tron.signed.length, 1, 'a second try would open a second prompt');
});

test('a TronLink that signs with another account is refused before anything is sent', async () => {
  const signer = createTronLinkSigner(fakeTronLink({ authorized: true, key: OTHER_KEY }), DEV_BASE58);
  await assert.rejects(signer.signTransaction({ hashHex: 'ab'.repeat(32), chainId: 2077 }), (error) => {
    assert.match(error.message, new RegExp(DEV_ADDRESS));
    assert.match(error.message, /switch/);
    return true;
  });
});

test('a TronLink that signs the hex as text is named, and is not blamed on the account', async () => {
  const signer = createTronLinkSigner(fakeTronLink({ authorized: true, style: 'hex-as-text' }), DEV_ADDRESS);
  await assert.rejects(signer.signTransaction({ hashHex: TX_HASH, chainId: 1000 }), (error) => {
    assert.match(error.message, /signed the hex text/);
    assert.doesNotMatch(error.message, /switch/);
    return true;
  });
});

test('a TronLink the site is not allowed in says to connect again', async () => {
  const signer = createTronLinkSigner(fakeTronLink({ authorized: false }), DEV_ADDRESS);
  await assert.rejects(signer.signTransaction({ hashHex: TX_HASH, chainId: 1000 }), /connect again/);
});

test('a TronLink answer that is not 65 bytes of hex is refused', async () => {
  for (const answer of ['0x1234', undefined, 42, '0x' + 'zz'.repeat(65)]) {
    const provider = { request: async () => null, tronWeb: { trx: { signMessageV2: async () => answer } } };
    const signer = createTronLinkSigner(provider, DEV_ADDRESS);
    await assert.rejects(signer.signTransaction({ hashHex: TX_HASH, chainId: 1000 }), /cannot read/);
  }
});

test('createTronLinkSigner refuses an address that is not a TRON address', () => {
  assert.throws(() => createTronLinkSigner(fakeTronLink(), 'TWGmce4sb65jzLEr2qiwA42ntizH66cmXq'), /not a TRON address/);
});

test('connectWallet with TronLink returns a signer for the account, in the Clutch form', async () => {
  const tron = fakeTronLink();
  const signer = await connectWallet(tronWallet(tron));
  assert.equal(signer.address, DEV_ADDRESS);
  assert.deepEqual(tron.requests, ['eth_requestAccounts']);
  // The connection opened the site to TronLink's tronWeb, so the signer can sign now.
  assert.deepEqual(await signer.signTransaction({ hashHex: TX_HASH, chainId: 1000 }), TRONWEB_TX_SIGNATURE);
});

test('connectWallet with an older TronLink falls back to tron_requestAccounts', async () => {
  const tron = fakeTronLink({ legacy: true });
  const signer = await connectWallet(tronWallet(tron));
  assert.equal(signer.address, DEV_ADDRESS);
  assert.deepEqual(tron.requests, ['eth_requestAccounts', 'tron_requestAccounts']);
});

test('connectWallet with TronLink passes the refusal on, with the code a person can read', async () => {
  await assert.rejects(connectWallet(tronWallet(fakeTronLink({ rejectConnect: true }))), { code: 4001 });
  await assert.rejects(connectWallet(tronWallet(fakeTronLink({ legacy: true, rejectConnect: true }))), { code: 4001 });
});

test('connectWallet with an older TronLink that is locked says so', async () => {
  const provider = {
    request: async ({ method }) => {
      if (method === 'eth_requestAccounts') throw Object.assign(new Error('Method not supported'), { code: 4200 });
      return ''; // TronLink answers an empty string when it is locked
    },
  };
  await assert.rejects(connectWallet(tronWallet(provider)), /locked/);
});

test('connectWallet refuses a TronLink answer with no account', async () => {
  for (const accounts of [[], null, ['nope'], [42]]) {
    await assert.rejects(connectWallet(tronWallet({ request: async () => accounts })), /did not share an account/);
  }
});

test('createSignerFor picks the signer for the kind of wallet', async () => {
  const tron = fakeTronLink({ authorized: true });
  const viaTron = createSignerFor(tronWallet(tron), DEV_BASE58);
  assert.deepEqual(await viaTron.signTransaction({ hashHex: TX_HASH, chainId: 1000 }), TRONWEB_TX_SIGNATURE);

  const metamask = fakeWallet();
  for (const wallet of [{ id: 'io.metamask', name: 'MetaMask', kind: 'evm', provider: metamask }, { id: 'x', name: 'X', provider: metamask }]) {
    const signer = createSignerFor(wallet, DEV_ADDRESS);
    assert.deepEqual(await signer.signTransaction({ hashHex: TX_HASH, chainId: 1000 }), {
      r: '0x03a910ef2c3144e635a9cd5dfb87d0f0a8e9cde11013b5fdbbd3098eb66ede07',
      s: '0x7270323fea8d69ffeedac84df538c026d630e027b4380686287350fcb8e03c91',
      v: 28,
    });
  }
});

test('sharedWalletAccount never opens a prompt', async () => {
  // TronLink: the site was allowed before, so tronWeb is ready; if not, tronWeb is false.
  const allowed = fakeTronLink({ authorized: true });
  assert.equal(await sharedWalletAccount(tronWallet(allowed)), DEV_ADDRESS);
  assert.equal(await sharedWalletAccount(tronWallet(fakeTronLink({ authorized: false }))), null);
  assert.deepEqual(allowed.requests, [], 'TronLink was not asked anything');

  // MetaMask and Trust Wallet: eth_accounts, which never prompts.
  const wallet = fakeWallet();
  wallet.request = async ({ method }) => {
    wallet.calls.push({ method });
    return method === 'eth_accounts' ? ['0xDEB4cfb63db134698e1879ea24904df074726cc0'] : assert.fail(`unexpected ${method}`);
  };
  assert.equal(await sharedWalletAccount({ id: 'io.metamask', name: 'MetaMask', provider: wallet }), DEV_ADDRESS);
  assert.deepEqual(wallet.calls, [{ method: 'eth_accounts' }]);
  assert.equal(await sharedWalletAccount({ id: 'x', name: 'X', provider: { request: async () => [] } }), null);
});

test('walletAccountFrom reads the first account of each kind of wallet', () => {
  assert.equal(walletAccountFrom({ kind: 'tron' }, [KEY1_BASE58]), KEY1_ADDRESS);
  assert.equal(walletAccountFrom({ kind: 'tron' }, []), null);
  assert.equal(walletAccountFrom({ kind: 'tron' }, ['nope']), null);
  assert.equal(walletAccountFrom({ kind: 'tron' }, undefined), null);
  assert.equal(walletAccountFrom({ kind: 'evm' }, ['0xDEB4cfb63db134698e1879ea24904df074726cc0']), DEV_ADDRESS);
  assert.equal(walletAccountFrom({}, ['0xDEB4cfb63db134698e1879ea24904df074726cc0']), DEV_ADDRESS);
  assert.equal(walletAccountFrom({ kind: 'evm' }, [KEY1_BASE58]), null, 'a base58 address is not an Ethereum account');
});

test('watchWalletAccounts follows accountsChanged, and stops when told', () => {
  const tron = fakeTronLink();
  const seen = [];
  const stop = watchWalletAccounts(tronWallet(tron), (account) => seen.push(account));
  tron.emit('accountsChanged', [KEY1_BASE58]); // the person switched account
  tron.emit('accountsChanged', []); // TronLink locked, or the site was disconnected
  assert.deepEqual(seen, [KEY1_ADDRESS, null]);

  stop();
  assert.equal(tron.listenerCount('accountsChanged'), 0);
  tron.emit('accountsChanged', [DEV_BASE58]);
  assert.equal(seen.length, 2, 'nothing after stop');

  // A provider that cannot be listened to gives a stop function that does nothing.
  assert.doesNotThrow(watchWalletAccounts({ kind: 'evm', provider: { request: async () => null } }, () => {}));
});

test('discoverInjectedWallets lists TronLink when it announces itself (TIP-6963), next to the others', async () => {
  const metamask = provider({ isMetaMask: true });
  const tron = fakeTronLink();
  const page = fakePage({
    announced: [{ info: { uuid: 'u1', name: 'MetaMask', rdns: 'io.metamask' }, provider: metamask }],
    tipAnnounced: [{ info: { uuid: 'u9', name: 'TronLink', icon: 'data:image/png;base64,CC', rdns: 'org.tronlink.www' }, provider: tron }],
  });
  const wallets = await discoverInjectedWallets({ host: page, timeoutMs: 5 });
  assert.deepEqual(wallets.map((w) => [w.id, w.name, w.kind]), [
    ['io.metamask', 'MetaMask', 'evm'],
    ['org.tronlink.www', 'TronLink', 'tron'],
  ]);
  assert.equal(wallets[1].provider, tron);
  assert.equal(wallets[1].icon, 'data:image/png;base64,CC');
});

test('discoverInjectedWallets adds a bare window.tron, or the older window.tronLink, as TronLink', async () => {
  const tron = fakeTronLink();
  for (const globals of [{ tron }, { tronLink: tron }, { tron, tronLink: fakeTronLink() }]) {
    const wallets = await discoverInjectedWallets({ host: fakePage(globals), timeoutMs: 5 });
    assert.deepEqual(wallets.map((w) => [w.id, w.name, w.kind]), [['injected-tron', 'TronLink', 'tron']]);
    assert.equal(wallets[0].provider, tron, 'window.tron wins over the older window.tronLink');
  }
});

test('discoverInjectedWallets lists TronLink once when it announces and sets window.tron', async () => {
  const tron = fakeTronLink();
  const page = fakePage({
    tipAnnounced: [{ info: { name: 'TronLink', rdns: 'org.tronlink.www' }, provider: tron }],
    tron,
  });
  const wallets = await discoverInjectedWallets({ host: page, timeoutMs: 5 });
  assert.deepEqual(wallets.map((w) => w.id), ['org.tronlink.www']);
});

test('discoverInjectedWallets lists a provider announced by both standards once, as a TRON wallet', async () => {
  const tron = fakeTronLink();
  const info = { name: 'TronLink', rdns: 'org.tronlink.www' };
  const page = fakePage({ announced: [{ info, provider: tron }], tipAnnounced: [{ info, provider: tron }] });
  const wallets = await discoverInjectedWallets({ host: page, timeoutMs: 5 });
  assert.deepEqual(wallets.map((w) => [w.id, w.kind]), [['org.tronlink.www', 'tron']]);
});

test('discoverInjectedWallets does not take window.ethereum for TronLink, or the reverse', async () => {
  const tron = fakeTronLink();
  const wallets = await discoverInjectedWallets({
    host: fakePage({ ethereum: provider({ isMetaMask: true }), tron }),
    timeoutMs: 5,
  });
  assert.deepEqual(wallets.map((w) => [w.name, w.kind]), [['MetaMask', 'evm'], ['TronLink', 'tron']]);
});

test('signTransaction with TronLink: the signature is the one a node checks', async () => {
  const sdk = new ClutchHubSdk('http://hub.test', DEV_ADDRESS, undefined, 2077);
  const signer = createTronLinkSigner(fakeTronLink({ authorized: true }), DEV_BASE58);
  const signed = await sdk.signTransaction(UNSIGNED, signer, EXPECTED);

  const { hash, recomputed, sig } = decodeSigned(signed);
  assert.equal(hash, recomputed, 'the hash on the wire is the hash of the unsigned transaction');
  // What `Transaction::verify_signature` does for TronLink: TIP-191 over clutch-tx:{chain}:{hash}.
  const text = `clutch-tx:2077:${hash}`;
  const signature = { r: '0x' + sig.r, s: '0x' + sig.s, v: sig.v };
  assert.equal(recover(tipDigest(Buffer.from(text)), signature), DEV_ADDRESS);
  assert.notEqual(recover(eip191Digest(text), signature), DEV_ADDRESS, 'and it is not the Ethereum scheme');
});

test('a TronLink signer logs in: the Hub API gets the signature of the readable challenge', async () => {
  const key = hex(secp.utils.randomPrivateKey());
  const address = addressFromPrivateKey(key);
  const tron = fakeTronLink({ key, authorized: true });
  const sdk = new ClutchHubSdk('http://hub.test', address, createTronLinkSigner(tron, address), 2077);
  const sent = [];
  sdk.apiClient.post = async (_url, body) => {
    sent.push(body);
    return tokenReply();
  };
  await sdk.ensureAuth();

  const { timestamp, signature } = sent[0].variables;
  const message = `clutch-auth:2077:${address}:${timestamp}`;
  assert.deepEqual(tron.signed, [message], 'TronLink is shown the readable challenge');
  assert.equal(recover(tipDigest(Buffer.from(message)), signature), address);
});

test('the shared socket never asks TronLink to sign in the background', async () => {
  const key = hex(secp.utils.randomPrivateKey());
  const address = addressFromPrivateKey(key);
  const tron = fakeTronLink({ key, authorized: true });
  const sdk = new ClutchHubSdk('http://hub.test', address, createTronLinkSigner(tron, address), 2077);
  assert.deepEqual(await sdk.wsConnectionParams(), {});
  assert.equal(tron.signed.length, 0);
});
