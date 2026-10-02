/**
 * Turns the dark modules of a QR code into one SVG path.
 *
 * `size` is the number of modules per side and `isDark(row, col)` says whether one is dark. The path
 * holds one rectangle per horizontal run of dark modules, in module units, shifted by `quiet` modules on
 * each side so a viewBox of `size + 2 * quiet` includes the quiet zone (scanners need about 4 modules
 * of white around the code). Merging runs keeps the path short: a version 3 code has 841 modules.
 *
 * Kept free of imports: it needs only `isDark`, so most of its tests use a small hand-made grid.
 *
 * @param {number} size
 * @param {(row: number, col: number) => boolean} isDark
 * @param {number} [quiet]
 * @returns {string} path data, e.g. "M1 1h1v1h-1z"
 */
export function qrPath(size, isDark, quiet = 0) {
  let d = '';
  for (let row = 0; row < size; row += 1) {
    let col = 0;
    while (col < size) {
      if (!isDark(row, col)) {
        col += 1;
        continue;
      }
      let end = col;
      while (end < size && isDark(row, end)) end += 1;
      d += `M${col + quiet} ${row + quiet}h${end - col}v1h${col - end}z`;
      col = end;
    }
  }
  return d;
}
