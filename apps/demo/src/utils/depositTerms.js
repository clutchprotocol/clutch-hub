/**
 * What a user must know before paying a GasFree deposit address (clutch-treasury's GasFree design,
 * §2). The relay's fee is taken from each deposit. The orchestrator reports the amount the treasury
 * takes: the configured maximum, never the live fee (`fee_up_to_usdt`, named for the most the relay can
 * charge). The panel shows it as the network fee, and says that the relay may charge less and that the
 * difference stays in the reserve (the maintainer's decision of 2026-10-05: say it plainly, not "up
 * to"). After the fee, a deposit must still reach the minimum, or nothing is minted and it waits for a
 * human. So a user must send at least the two together.
 *
 * `body` is the orchestrator's `POST /api/v1/deposits` answer. A plain address carries neither field
 * and gets `null`: nothing is taken from it.
 *
 * Formats here rather than through `money.js`, which imports the SDK: `node --test` loads this module,
 * and no demo test loads the SDK in Node.
 *
 * @param {{ fee_up_to_usdt?: number|string, min_deposit_usdt?: number|string } | undefined} body
 * @returns {{ feeUpTo: string, minimum: string, sendAtLeast: string } | null} amounts in USDT, e.g. "2.00"
 */
export function depositTerms(body) {
  if (body?.fee_up_to_usdt == null || body?.min_deposit_usdt == null) return null;
  const fee = BigInt(body.fee_up_to_usdt);
  const minimum = BigInt(body.min_deposit_usdt);
  return { feeUpTo: usdt(fee), minimum: usdt(minimum), sendAtLeast: usdt(fee + minimum) };
}

/** Micro-USDT as USDT, with trailing zeros trimmed down to two decimals: "2.00", "1.234567". */
function usdt(micro) {
  const whole = micro / 1_000_000n;
  const fraction = (micro % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '').padEnd(2, '0');
  return `${whole}.${fraction}`;
}
