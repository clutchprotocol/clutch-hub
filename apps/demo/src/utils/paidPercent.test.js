import test from 'node:test';
import assert from 'node:assert/strict';
import { paidPercent } from './paidPercent.js';

test('a zero fare reads as 0', () => {
  assert.equal(paidPercent(0n, 0n), 0);
  assert.equal(paidPercent(5n, 0n), 0);
});

test('nothing paid reads as 0', () => {
  assert.equal(paidPercent(0n, 100n), 0);
});

test('part paid rounds down', () => {
  assert.equal(paidPercent(1n, 3n), 33);
  assert.equal(paidPercent(3_000_000n, 5_000_000n), 60);
  assert.equal(paidPercent(99n, 100n), 99);
});

test('fully paid reads as 100 and overpaid is held at 100', () => {
  assert.equal(paidPercent(100n, 100n), 100);
  assert.equal(paidPercent(150n, 100n), 100);
});

test('accepts the number and string forms the wire sends', () => {
  assert.equal(paidPercent('2500000', '10000000'), 25);
  assert.equal(paidPercent(1, 4), 25);
});

test('does not lose precision above 2^53', () => {
  const total = 9_007_199_254_740_993n * 10n;
  assert.equal(paidPercent(total / 2n, total), 50);
  // A float divide rounds both numbers to 90071992547409936 and gives 100.
  assert.equal(paidPercent(total - 1n, total), 99);
});
