// Runs against dist/ — `npm run build` first. `node --test test/` (Node >= 20, no framework).
//
// A wallet signs with `personal_sign` (EIP-191), not over a bare hash. These tests stand a fake
// wallet next to the SDK. The fake is written here, from the standard, the way MetaMask does it,
// and not from the SDK's own code; and two signatures are pinned that the node's and the Hub API's
// Rust tests also pin (`a_signature_made_by_a_javascript_library_verifies`,
// `javascript_wallet_fixture_verifies`), so a change on one side cannot pass quietly.
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
  createWalletSigner,
  discoverInjectedWallets,
  personalSignDigest,
  walletTransactionText,
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

test('login without any key or signer says what is missing', async () => {
  const address = addressFromPrivateKey(hex(secp.utils.randomPrivateKey()));
  const sdk = new ClutchHubSdk('http://hub.test', address, undefined, 2077);
  await assert.rejects(sdk.ensureAuth(), /proof of key ownership.*signer/s);
});

// --- finding a wallet --------------------------------------------------------------------------

/** A page with wallets that announce themselves, and perhaps a `window.ethereum`. */
function fakePage({ announced = [], ethereum } = {}) {
  const page = new EventTarget();
  page.ethereum = ethereum;
  page.addEventListener('eip6963:requestProvider', () => {
    for (const { info, provider } of announced) {
      page.dispatchEvent(Object.assign(new Event('eip6963:announceProvider'), { detail: { info, provider } }));
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
