import test from 'node:test';
import assert from 'node:assert/strict';
import {
  approveInWalletMessage,
  describeWalletError,
  firstAccount,
  forgetWalletId,
  isMobileUserAgent,
  recallWalletId,
  rememberWalletId,
  removeLegacyKeys,
  walletHelpLinks,
} from './walletSession.js';

/** A stand-in for localStorage. */
function fakeStorage(initial = {}) {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: (key) => items.delete(key),
  };
}

/** A storage that refuses everything, as a browser in private mode may. */
const blockedStorage = {
  getItem() { throw new Error('blocked'); },
  setItem() { throw new Error('blocked'); },
  removeItem() { throw new Error('blocked'); },
};

test('a wallet id is remembered, recalled and forgotten', () => {
  const storage = fakeStorage();
  assert.equal(recallWalletId(storage), '');
  rememberWalletId('io.metamask', storage);
  assert.equal(recallWalletId(storage), 'io.metamask');
  forgetWalletId(storage);
  assert.equal(recallWalletId(storage), '');
});

test('the wallet id is all that is remembered: no key of any kind is written', () => {
  const storage = fakeStorage();
  rememberWalletId('io.metamask', storage);
  assert.deepEqual([...storage.items.keys()], ['clutch_wallet_id']);
});

test('a blocked or missing storage is no error', () => {
  assert.doesNotThrow(() => rememberWalletId('x', blockedStorage));
  assert.equal(recallWalletId(blockedStorage), '');
  assert.doesNotThrow(() => forgetWalletId(blockedStorage));
  assert.doesNotThrow(() => removeLegacyKeys(blockedStorage));
  // In Node there is no localStorage at all.
  assert.equal(recallWalletId(), '');
  assert.doesNotThrow(() => removeLegacyKeys());
});

test('the private keys of an older version are deleted, and nothing else is', () => {
  const storage = fakeStorage({
    clutch_passenger_publicKey: '0xaaa',
    clutch_passenger_privateKey: 'secret-1',
    clutch_driver_publicKey: '0xbbb',
    clutch_driver_privateKey: 'secret-2',
    clutch_demo_role: 'driver',
    'clutch_tx_0xaaa': '[]',
    clutch_wallet_id: 'io.metamask',
  });
  removeLegacyKeys(storage);
  assert.deepEqual([...storage.items.keys()].sort(), ['clutch_demo_role', 'clutch_tx_0xaaa', 'clutch_wallet_id']);
});

test('firstAccount gives a lower-case address, or nothing', () => {
  assert.equal(firstAccount(['0xDEB4cfb63db134698e1879ea24904df074726cc0']), '0xdeb4cfb63db134698e1879ea24904df074726cc0');
  assert.equal(firstAccount([]), '');
  assert.equal(firstAccount(undefined), '');
  assert.equal(firstAccount(null), '');
  assert.equal(firstAccount(['not an address']), '');
  assert.equal(firstAccount([42]), '');
  assert.equal(firstAccount('0xdeb4cfb63db134698e1879ea24904df074726cc0'), '', 'a bare string is not a list of accounts');
});

test('wallet errors are put in plain words', () => {
  assert.match(describeWalletError({ code: 4001 }), /said no/);
  assert.match(describeWalletError({ code: -32002 }), /already has a request open/);
  assert.match(describeWalletError({ code: 4100 }), /has not shared this account/);
  assert.match(describeWalletError({ code: 4900 }), /not connected/);
  assert.match(describeWalletError({ code: 4901 }), /not connected/);
  // Anything else keeps its own message, which the SDK writes for people (for example "switch to ...").
  assert.equal(describeWalletError(new Error('the wallet signed with 0x1, not 0x2')), 'the wallet signed with 0x1, not 0x2');
  assert.match(describeWalletError(undefined), /went wrong with your wallet/);
  assert.equal(describeWalletError({}, 'Payment failed'), 'Payment failed');
  assert.equal(describeWalletError({ message: 'insufficient balance' }, 'Payment failed'), 'insufficient balance');
});

test('the prompt line says what to approve, and that a sign-in comes first when it does', () => {
  assert.equal(approveInWalletMessage('pay $2.50 for this ride'), 'Approve in your wallet: pay $2.50 for this ride.');
  assert.equal(
    approveInWalletMessage('pay $2.50 for this ride', false),
    'Approve in your wallet: sign in, then pay $2.50 for this ride.',
  );
});

test('a phone is told by its user agent', () => {
  assert.equal(isMobileUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), true);
  assert.equal(isMobileUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8)'), true);
  assert.equal(isMobileUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130'), false);
  assert.equal(isMobileUserAgent(undefined), false);
});

test('on a phone the help opens this page inside the wallet app', () => {
  const links = walletHelpLinks({ href: 'https://app.clutchprotocol.io/?x=1', mobile: true });
  assert.deepEqual(links, [
    { id: 'metamask', label: 'Open in MetaMask', url: 'https://metamask.app.link/dapp/app.clutchprotocol.io/?x=1' },
    {
      id: 'trust',
      label: 'Open in Trust Wallet',
      url: 'https://link.trustwallet.com/open_url?coin_id=60&url=https%3A%2F%2Fapp.clutchprotocol.io%2F%3Fx%3D1',
    },
  ]);
});

test('on a computer the help is where to get the wallet', () => {
  const links = walletHelpLinks({ href: 'https://app.clutchprotocol.io/', mobile: false });
  assert.deepEqual(links.map((link) => [link.id, link.url]), [
    ['metamask', 'https://metamask.io/download/'],
    ['trust', 'https://trustwallet.com/download'],
  ]);
});
