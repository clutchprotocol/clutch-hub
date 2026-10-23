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

/**
 * The treasury's service fee, from the same answer: a share of the CLT a top-up mints, at least a
 * minimum, never on the user's first top-up (clutch-treasury `service_fee.rs`). Unlike the network
 * fee it is not taken from the USDT, so it does not change what to send.
 *
 * @param {{ service_fee_bps?: number|string, service_fee_min_usdt?: number|string, service_fee_waived?: boolean } | undefined} body
 * @returns {{ percent: string, minimum: string, waived: boolean } | null} e.g. "1%", "0.50"; null when there is no fee
 */
export function serviceFee(body) {
  if (body?.service_fee_bps == null) return null;
  const bps = Number(body.service_fee_bps);
  if (!Number.isInteger(bps) || bps <= 0) return null;
  const percent = `${(bps / 100).toString()}%`;
  return { percent, minimum: usdt(BigInt(body.service_fee_min_usdt ?? 0)), waived: body.service_fee_waived === true };
}

/** Micro-USDT as USDT, with trailing zeros trimmed down to two decimals: "2.00", "1.234567". */
function usdt(micro) {
  const whole = micro / 1_000_000n;
  const fraction = (micro % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '').padEnd(2, '0');
  return `${whole}.${fraction}`;
}
