import test from 'node:test';
import assert from 'node:assert/strict';
import { depositTerms, serviceFee } from './depositTerms.js';

test('a plain address has no terms', () => {
  assert.equal(depositTerms({ address: 'TPlainAddress' }), null);
  assert.equal(depositTerms(undefined), null);
});

test('a first deposit to a GasFree address: activation and transfer, then the minimum', () => {
  assert.deepEqual(
    depositTerms({ address: 'TGasFreeAddress', fee_up_to_usdt: 2_000_000, min_deposit_usdt: 1_000_000 }),
    { feeUpTo: '2.00', minimum: '1.00', sendAtLeast: '3.00' },
  );
});

test('a later deposit pays the transfer fee only', () => {
  assert.deepEqual(
    depositTerms({ address: 'TGasFreeAddress', fee_up_to_usdt: 500_000, min_deposit_usdt: 1_000_000 }),
    { feeUpTo: '0.50', minimum: '1.00', sendAtLeast: '1.50' },
  );
});

test('every micro-USDT is kept', () => {
  assert.deepEqual(
    depositTerms({ fee_up_to_usdt: '1234567', min_deposit_usdt: '1' }),
    { feeUpTo: '1.234567', minimum: '0.000001', sendAtLeast: '1.234568' },
  );
});

test('one of the two fields alone is not terms', () => {
  assert.equal(depositTerms({ fee_up_to_usdt: 500_000 }), null);
  assert.equal(depositTerms({ min_deposit_usdt: 1_000_000 }), null);
});

test('no service fee unless the answer names one', () => {
  assert.equal(serviceFee({ address: 'T' }), null);
  assert.equal(serviceFee(undefined), null);
  assert.equal(serviceFee({ service_fee_bps: 0, service_fee_min_usdt: 0 }), null);
});

test('the service fee as a percent and a minimum, waived on a first top-up', () => {
  assert.deepEqual(
    serviceFee({ service_fee_bps: 100, service_fee_min_usdt: 500_000, service_fee_waived: true }),
    { percent: '1%', minimum: '0.50', waived: true },
  );
  assert.deepEqual(
    serviceFee({ service_fee_bps: '150', service_fee_min_usdt: '0', service_fee_waived: false }),
    { percent: '1.5%', minimum: '0.00', waived: false },
  );
});
