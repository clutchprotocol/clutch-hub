import { test } from 'node:test';
import assert from 'node:assert/strict';
import { directAmount, directPlan, usdt } from './directTopUp.js';

const FLOAT = 'TQwgeRaDt4FSJSsncmFNcbMNTfFpjvjwFX';
const USER = 'TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdH';
const USDT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

test('a full answer becomes a plan', () => {
  assert.deepEqual(directPlan({ pay_to: FLOAT, from: USER, usdt_contract: USDT, min_deposit_usdt: 1000000 }), {
    payTo: FLOAT,
    from: USER,
    contract: USDT,
    minimum: 1_000_000n,
  });
});

test('no minimum is a minimum of zero', () => {
  assert.equal(directPlan({ pay_to: FLOAT, from: USER, usdt_contract: USDT }).minimum, 0n);
});

test('an answer missing where to pay is no plan', () => {
  assert.equal(directPlan({ from: USER, usdt_contract: USDT }), null);
  assert.equal(directPlan({ pay_to: '0x1234', from: USER, usdt_contract: USDT }), null);
  assert.equal(directPlan(undefined), null);
});

test('amounts are read exactly', () => {
  assert.deepEqual(directAmount('25', 1_000_000n), { micro: 25_000_000n });
  assert.deepEqual(directAmount(' 5.005 ', 0n), { micro: 5_005_000n });
  assert.deepEqual(directAmount('0.000001', 0n), { micro: 1n });
});

test('bad amounts say why', () => {
  assert.match(directAmount('', 0n).error, /amount/);
  assert.match(directAmount('1.1234567', 0n).error, /6 decimals/);
  assert.match(directAmount('-1', 0n).error, /amount/);
  assert.match(directAmount('0', 0n).error, /above zero/);
  assert.match(directAmount('0.5', 1_000_000n).error, /1\.00 USDT/);
});

test('usdt trims to two decimals', () => {
  assert.equal(usdt(1_000_000n), '1.00');
  assert.equal(usdt(2_500_000n), '2.50');
  assert.equal(usdt(1_234_567n), '1.234567');
});
