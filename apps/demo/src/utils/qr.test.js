import test from 'node:test';
import assert from 'node:assert/strict';
import qrcode from '../vendor/qrcode.js';
import { qrPath } from './qr.js';

const grid = (rows) => (r, c) => rows[r][c] === '#';

test('an empty code has an empty path', () => {
  assert.equal(qrPath(2, () => false), '');
});

test('one dark module is one unit square', () => {
  assert.equal(qrPath(3, grid(['...', '.#.', '...'])), 'M1 1h1v1h-1z');
});

test('a horizontal run is one rectangle, not one square per module', () => {
  assert.equal(qrPath(4, grid(['....', '###.', '....', '....'])), 'M0 1h3v1h-3z');
});

test('a run ends at a gap and a new one starts after it', () => {
  assert.equal(qrPath(5, grid(['#.##.', '.....', '.....', '.....', '.....'])), 'M0 0h1v1h-1zM2 0h2v1h-2z');
});

test('rows are scanned top to bottom and runs left to right', () => {
  assert.equal(qrPath(3, grid(['#..', '...', '..#'])), 'M0 0h1v1h-1zM2 2h1v1h-1z');
});

test('the quiet zone shifts every rectangle', () => {
  assert.equal(qrPath(3, grid(['...', '.#.', '...']), 4), 'M5 5h1v1h-1z');
});

// The vendored generator (src/vendor/qrcode.js) was changed from a UMD file into an ES module. This
// proves it still runs as one, in strict mode, and draws the three finder patterns every QR code has.
test('the vendored generator draws a version 3 code for a TRON address with its finder patterns', () => {
  const qr = qrcode(0, 'M');
  qr.addData('THH4saXiZmFDtGWUZ8jw6GrmphEMJvtVbu');
  qr.make();
  const n = qr.getModuleCount();
  assert.equal(n, 29);
  const finder = [
    '#######',
    '#.....#',
    '#.###.#',
    '#.###.#',
    '#.###.#',
    '#.....#',
    '#######',
  ];
  for (const [r0, c0] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
    for (let r = 0; r < 7; r += 1) {
      for (let c = 0; c < 7; c += 1) {
        assert.equal(qr.isDark(r0 + r, c0 + c), finder[r][c] === '#', `finder at ${r0},${c0} module ${r},${c}`);
      }
    }
  }
});
