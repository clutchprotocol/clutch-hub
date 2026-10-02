/**
 * How much of a fare has been paid, as a whole percent from 0 to 100.
 *
 * Integer math on purpose, like utils/money.js: fares are bigint CLT base units, and a float divide
 * would lose the last digits on a large fare. It rounds down, so the meter never shows 100 before the
 * fare is fully paid. A zero or missing fare reads as 0, and an overpaid fare is held at 100, so the
 * receipt meter never draws outside its frame.
 *
 * Kept free of imports (money.js pulls in the SDK) so its test needs no SDK build.
 *
 * @param {bigint|number|string} paid  CLT base units paid so far
 * @param {bigint|number|string} total CLT base units of the whole fare
 * @returns {number} 0 to 100
 */
export function paidPercent(paid, total) {
  const whole = BigInt(total);
  const part = BigInt(paid);
  if (whole <= 0n || part <= 0n) return 0;
  if (part >= whole) return 100;
  return Number((part * 100n) / whole);
}
