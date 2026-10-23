/**
 * TronLink direct top-ups (clutch-treasury `payment-orchestrator/src/direct.rs`): a user signed in
 * with TronLink pays USDT from their own TRON address straight to the treasury's pay-in address.
 * The orchestrator credits it by sender, which works because the TRON address and the Clutch address
 * are the same 20 bytes, so only the person's own key can send from it. There is no deposit address,
 * no sweep and no relay fee; TronLink charges TRON's network fee in TRX from the wallet.
 *
 * Pure helpers only, no SDK and no wallet, so `node --test` can load this file.
 */

/**
 * The orchestrator's `POST /api/v1/direct-topups` answer, checked. `null` when it is missing a field
 * the payment needs, so the caller refuses to pay rather than paying somewhere half-known.
 *
 * @param {{ pay_to?: string, from?: string, usdt_contract?: string, min_deposit_usdt?: number|string } | undefined} body
 * @returns {{ payTo: string, from: string, contract: string, minimum: bigint } | null}
 */
export function directPlan(body) {
  const tron = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
  if (!tron.test(body?.pay_to ?? '') || !tron.test(body?.from ?? '') || !tron.test(body?.usdt_contract ?? '')) {
    return null;
  }
  return {
    payTo: body.pay_to,
    from: body.from,
    contract: body.usdt_contract,
    minimum: BigInt(body.min_deposit_usdt ?? 0),
  };
}

/**
 * A typed USDT amount as micro-USDT, or the reason it cannot be sent. Integer maths only: USDT has 6
 * decimals, and a float turns "5.005" into 5.004999.
 *
 * @param {string} input
 * @param {bigint} minimum micro-USDT
 * @returns {{ micro: bigint } | { error: string }}
 */
export function directAmount(input, minimum) {
  const m = /^(\d+)(?:\.(\d{1,6}))?$/.exec(String(input ?? '').trim());
  if (!m) return { error: 'Enter an amount in USDT, with at most 6 decimals.' };
  const micro = BigInt(m[1]) * 1_000_000n + BigInt((m[2] ?? '').padEnd(6, '0'));
  if (micro <= 0n) return { error: 'Enter an amount above zero.' };
  if (micro < minimum) return { error: `The smallest top-up is ${usdt(minimum)} USDT.` };
  return { micro };
}

/** Micro-USDT as USDT, trailing zeros trimmed down to two decimals: "1.00", "2.5" -> "2.50". */
export function usdt(micro) {
  const whole = micro / 1_000_000n;
  const fraction = (micro % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '').padEnd(2, '0');
  return `${whole}.${fraction}`;
}
