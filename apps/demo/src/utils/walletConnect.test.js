import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  attachWalletProvider,
  endWalletSession,
  providerOnce,
  walletConnectAsEip1193,
  walletConnectEntry,
  walletConnectLabel,
} from './walletConnect.js';

test('without a project ID there is no WalletConnect entry', () => {
  assert.equal(walletConnectEntry(''), null);
  assert.equal(walletConnectEntry(undefined), null);
});

test('with a project ID the entry is a lazy EVM wallet', () => {
  assert.deepEqual(walletConnectEntry('project-id'), {
    id: 'walletconnect',
    name: 'WalletConnect',
    kind: 'evm',
    lazy: true,
  });
});

test('providerOnce starts the library once and shares its provider', async () => {
  let starts = 0;
  const get = providerOnce(async (projectId) => {
    starts += 1;
    return { projectId };
  });
  const [first, second] = await Promise.all([get('p'), get('p')]);
  assert.equal(starts, 1);
  assert.equal(first, second);
  assert.deepEqual(first, { projectId: 'p' });
});

test('providerOnce tries again after a failed start', async () => {
  let attempts = 0;
  const get = providerOnce(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('relay unreachable');
    return { ok: true };
  });
  await assert.rejects(get('p'), /relay unreachable/);
  assert.deepEqual(await get('p'), { ok: true });
  assert.equal(attempts, 2);
});

test('eth_requestAccounts opens the session with enable; other calls go to the library', async () => {
  const calls = [];
  const library = {
    enable: async () => {
      calls.push('enable');
      return ['0xabc'];
    },
    request: async ({ method }) => {
      calls.push(method);
      return 'signature';
    },
    on: () => 'subscribed',
    removeListener: () => 'unsubscribed',
  };
  const wallet = walletConnectAsEip1193(library);
  assert.deepEqual(await wallet.request({ method: 'eth_requestAccounts' }), ['0xabc']);
  assert.equal(await wallet.request({ method: 'personal_sign', params: ['text', '0xabc'] }), 'signature');
  assert.deepEqual(calls, ['enable', 'personal_sign']);
  assert.equal(wallet.on('accountsChanged', () => {}), 'subscribed');
  assert.equal(wallet.removeListener('accountsChanged', () => {}), 'unsubscribed');
});

test('attachWalletProvider leaves injected wallets alone and gives a WalletConnect entry its provider', async () => {
  const injected = { id: 'io.metamask', name: 'MetaMask', kind: 'evm', provider: {} };
  assert.equal(await attachWalletProvider(injected, 'p'), injected);

  const library = { enable: async () => [], request: async () => null, on() {}, removeListener() {} };
  const wallet = await attachWalletProvider(walletConnectEntry('p'), 'p', async (projectId) => {
    assert.equal(projectId, 'p');
    return library;
  });
  assert.equal(wallet.id, 'walletconnect');
  assert.equal(wallet.kind, 'evm');
  assert.equal('lazy' in wallet, false);
  assert.equal(typeof wallet.provider.request, 'function');
});

test('ending the session goes to the WalletConnect library, and never to an injected wallet', async () => {
  let ended = 0;
  const library = {
    enable: async () => [],
    request: async () => null,
    on() {},
    removeListener() {},
    disconnect: async () => {
      ended += 1;
    },
  };
  await endWalletSession({ id: 'walletconnect', provider: walletConnectAsEip1193(library) });
  assert.equal(ended, 1);
  await endWalletSession({ id: 'io.metamask', provider: library });
  assert.equal(ended, 1);
});

test('ending a session the phone already closed does not throw', async () => {
  const library = {
    enable: async () => [],
    request: async () => null,
    on() {},
    removeListener() {},
    disconnect: async () => {
      throw new Error('No matching key');
    },
  };
  await endWalletSession({ id: 'walletconnect', provider: walletConnectAsEip1193(library) });
});

test('the WalletConnect button names the wallets it reaches, not WalletConnect', () => {
  assert.match(walletConnectLabel(true).name, /MetaMask, Trust Wallet/);
  assert.match(walletConnectLabel(true).hint, /come back to this page/);
  assert.equal(walletConnectLabel(false).name, 'Wallet on your phone');
  assert.match(walletConnectLabel(false).hint, /QR code/);
});
