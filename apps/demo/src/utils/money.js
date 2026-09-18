import { formatUsd as formatUsdStrict } from 'clutch-hub-sdk-js';

/**
 * Format CLT base units as USD, accepting whatever the wire actually delivers.
 *
 * The SDK's `formatUsd` takes a `bigint` and divides by `10000n`. The hub sends every money field
 * as a decimal STRING — deliberately, because these values exceed 2^53 and a JSON number would
 * lose precision — so passing `req.fare` straight through threw
 * "Cannot mix BigInt and other types" and blanked the whole view on render.
 *
 * Converting here rather than at each call site because there are a dozen of them across
 * PassengerView / DriverView / NetworkView, and the next one added would hit the same trap.
 * `TransactionHistory` and `ActiveTripCard` already did their own `BigInt(...)` conversion; this
 * makes that unnecessary rather than something each component must remember.
 *
 * Returns an em dash for null/undefined/unparseable input: a missing fare should render as
 * "no value", never crash a list.
 *
 * @param {bigint|number|string|null|undefined} value CLT base units
 * @returns {string}
 */
export function formatUsd(value) {
  if (value === null || value === undefined || value === '') return '—';
  try {
    return formatUsdStrict(typeof value === 'bigint' ? value : BigInt(value));
  } catch {
    return '—';
  }
}

/**
 * Parse a user-typed USD string into CLT base units (1 USD = 1,000,000 CLT).
 * Integer math only — a float parse (`parseFloat(x) * 1e6`) reintroduces the precision loss
 * bigint amounts exist to avoid (e.g. floats turn "5.005" into "5.0049999...").
 * @param {string} input
 * @returns {bigint}
 * @throws {Error} if input isn't `^\d+(\.\d{1,6})?$`
 */
export function parseUsdToClt(input) {
  const m = /^(\d+)(?:\.(\d{1,6}))?$/.exec(String(input).trim());
  if (!m) throw new Error('invalid amount');
  return BigInt(m[1]) * 1_000_000n + BigInt((m[2] ?? '').padEnd(6, '0'));
}

/**
 * Format a micro-USDT integer as an EXACT 6-decimal string — never rounded, truncated, or
 * comma-grouped. This is deliberately NOT `formatUsd`: `formatUsd` floors to cents, which is fine
 * for display but wrong here, because `pay_amount_usdt` is the MINIMUM that settles the deposit and
 * the user pays what this string says. A request for 5.123456 shown as "5.12" is a payment 0.003456
 * short — and short does not settle, it sits as a partial payment waiting for the remainder.
 *
 * (This used to be about a fractional discriminator identifying a deposit on one shared custody
 * address. That design is gone — each deposit has its own derived address now — but flooring is
 * still wrong, for the simpler reason above.)
 *
 * Integer arithmetic only, per the same rule as the rest of this file — `Number(x) / 1e6` is unsafe
 * for the same reason `parseFloat` is banned above.
 *
 * Accepts whatever the wire actually sends (bigint, number, or numeric string) — the hub/orchestrator
 * boundary has already proven itself inconsistent about number vs decimal-string (see `formatUsd`
 * above), so this defends the same way rather than assuming a shape.
 *
 * @param {bigint|number|string} microUsdt
 * @returns {string} e.g. "5.123456"
 * @throws {Error} if the value can't be read as an integer
 */
export function formatExactUsdt(microUsdt) {
  const n = typeof microUsdt === 'bigint' ? microUsdt : BigInt(microUsdt);
  if (n < 0n) throw new Error('amount must not be negative');
  return `${n / 1_000_000n}.${(n % 1_000_000n).toString().padStart(6, '0')}`;
}
