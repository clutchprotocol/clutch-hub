import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bscAmount, bscPlan, bscTxUrl, switchToBsc, transferData } from './bscTopUp.js';

const PAY_IN = '0x2222222222222222222222222222222222222222';
const USER = '0xC8599111F29C1E1E061265B4AF93EA1F274AD78A';
const USDT = '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd';
const answer = { network: 'bsc', chain_id: 97, pay_to: PAY_IN, from: USER, usdt_contract: USDT, usdt_decimals: 18, min_deposit_usdt: 1000000 };

test('a full answer becomes a plan, lowercased', () => {
  assert.deepEqual(bscPlan(answer), {
    chainId: 97,
    payTo: PAY_IN,
    from: USER.toLowerCase(),
    contract: USDT.toLowerCase(),
    decimals: 18,
    minimum: 1_000_000n,
  });
});

test('an answer for another chain, a TRON address or no decimals is no plan', () => {
  assert.equal(bscPlan({ ...answer, chain_id: 1 }), null);
  assert.equal(bscPlan({ ...answer, network: 'tron' }), null);
  assert.equal(bscPlan({ ...answer, pay_to: 'TQwgeRaDt4FSJSsncmFNcbMNTfFpjvjwFX' }), null);
  assert.equal(bscPlan({ ...answer, usdt_decimals: undefined }), null);
  assert.equal(bscPlan(undefined), null);
});

test('amounts become 18-decimal units exactly', () => {
  assert.deepEqual(bscAmount('25', 1_000_000n, 18), { micro: 25_000_000n, units: 25_000_000_000_000_000_000n });
  assert.deepEqual(bscAmount('0.000001', 0n, 18), { micro: 1n, units: 1_000_000_000_000n });
  assert.ok(bscAmount('0.5', 1_000_000n, 18).error);
  assert.ok(bscAmount('1.0000001', 0n, 18).error, 'finer than a Clutch dollar has');
  assert.ok(bscAmount('abc', 0n, 18).error);
});

test('the transfer call data is transfer(address,uint256)', () => {
  assert.equal(
    transferData(PAY_IN, 25n * 10n ** 18n),
    '0xa9059cbb' +
      '0000000000000000000000002222222222222222222222222222222222222222' +
      '0000000000000000000000000000000000000000000000015af1d78b58c40000',
  );
});

test('the explorer link names the right BscScan', () => {
  assert.equal(bscTxUrl(97, '0xab'), 'https://testnet.bscscan.com/tx/0xab');
  assert.equal(bscTxUrl(56, '0xab'), 'https://bscscan.com/tx/0xab');
});

function fakeProvider(onSwitch, chain = '0x1') {
  const calls = [];
  return {
    calls,
    request: async ({ method, params }) => {
      calls.push(method);
      if (method === 'eth_chainId') return chain;
      if (method === 'wallet_switchEthereumChain') return onSwitch(params);
      return null;
    },
  };
}

test('a wallet already on BSC is left alone', async () => {
  const p = fakeProvider(() => null, '0x61');
  await switchToBsc(p, 97);
  assert.deepEqual(p.calls, ['eth_chainId']);
});

test('a wallet that does not know BSC is asked to add it', async () => {
  const p = fakeProvider(() => {
    throw Object.assign(new Error('Unrecognized chain ID'), { code: 4902 });
  });
  await switchToBsc(p, 97);
  assert.deepEqual(p.calls, ['eth_chainId', 'wallet_switchEthereumChain', 'wallet_addEthereumChain']);
});

test('saying no to the switch is not turned into an add', async () => {
  const p = fakeProvider(() => {
    throw Object.assign(new Error('User rejected the request.'), { code: 4001 });
  });
  await assert.rejects(switchToBsc(p, 56), { code: 4001 });
  assert.deepEqual(p.calls, ['eth_chainId', 'wallet_switchEthereumChain']);
});
