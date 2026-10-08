import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addClutchToWallet,
  addNetworkParams,
  canAddNetwork,
  fetchWalletChainId,
  rpcUrlFor,
} from './walletNetwork.js';

function fakeFetch(reply, status = 200) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return { ok: status >= 200 && status < 300, status, json: async () => reply };
  };
  return { impl, calls };
}

test('the rpc URL is the hub URL plus /rpc, whatever the trailing slash', () => {
  assert.equal(rpcUrlFor('https://api-stage.clutchprotocol.io'), 'https://api-stage.clutchprotocol.io/rpc');
  assert.equal(rpcUrlFor('http://localhost:3000/'), 'http://localhost:3000/rpc');
});

test('TronLink cannot add a network; MetaMask, Trust Wallet and WalletConnect can', () => {
  assert.equal(canAddNetwork({ kind: 'tron', provider: {} }), false);
  assert.equal(canAddNetwork({ kind: 'evm', provider: {} }), true);
  assert.equal(canAddNetwork({ provider: {} }), true);
  assert.equal(canAddNetwork(null), false);
  assert.equal(canAddNetwork({ kind: 'evm' }), false);
});

test('the network says 18 decimals and names the testnet as such', () => {
  const params = addNetworkParams({
    chainIdHex: '0x5123',
    rpcUrl: 'https://api-stage.clutchprotocol.io/rpc',
    explorerUrl: 'https://explorer-stage.clutchprotocol.io',
    isTestnet: true,
  });
  assert.deepEqual(params, {
    chainId: '0x5123',
    chainName: 'Clutch Testnet',
    nativeCurrency: { name: 'Clutch', symbol: 'CLT', decimals: 18 },
    rpcUrls: ['https://api-stage.clutchprotocol.io/rpc'],
    blockExplorerUrls: ['https://explorer-stage.clutchprotocol.io'],
  });
  const mainnet = addNetworkParams({ chainIdHex: '0x5122', rpcUrl: 'x', explorerUrl: null, isTestnet: false });
  assert.equal(mainnet.chainName, 'Clutch');
  assert.equal('blockExplorerUrls' in mainnet, false, 'no explorer means no empty URL');
});

test('the chain id comes from the endpoint, and a bad answer is an error', async () => {
  const good = fakeFetch({ jsonrpc: '2.0', id: 1, result: '0x5123' });
  assert.equal(await fetchWalletChainId('https://h/rpc', good.impl), '0x5123');
  assert.equal(good.calls[0].body.method, 'eth_chainId');

  await assert.rejects(fetchWalletChainId('u', fakeFetch({ error: { code: -32000 } }).impl));
  await assert.rejects(fetchWalletChainId('u', fakeFetch({ result: 20771 }).impl));
  await assert.rejects(fetchWalletChainId('u', fakeFetch({}, 502).impl), /HTTP 502/);
});

test('adding asks the wallet once, with the endpoint id', async () => {
  const requests = [];
  const wallet = { kind: 'evm', provider: { request: async (args) => { requests.push(args); return null; } } };
  const { impl } = fakeFetch({ result: '0x5123' });
  await addClutchToWallet(wallet, { apiUrl: 'https://api-stage.clutchprotocol.io', explorerUrl: null, isTestnet: true }, impl);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, 'wallet_addEthereumChain');
  assert.equal(requests[0].params[0].chainId, '0x5123');
  assert.deepEqual(requests[0].params[0].rpcUrls, ['https://api-stage.clutchprotocol.io/rpc']);
});

test('a wallet that says no rejects with its own error', async () => {
  const refusal = Object.assign(new Error('User rejected'), { code: 4001 });
  const wallet = { kind: 'evm', provider: { request: async () => { throw refusal; } } };
  const { impl } = fakeFetch({ result: '0x5123' });
  await assert.rejects(
    addClutchToWallet(wallet, { apiUrl: 'h', explorerUrl: null, isTestnet: true }, impl),
    (err) => err.code === 4001,
  );
});
