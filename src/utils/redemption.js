import { formatExactUsdt, parseUsdToClt } from './money';

// Redemption record handling, lifted out of WithdrawPanel: the localStorage round-trip that
// survives a reload mid-burn, and the three functions that turn a treasury record into
// something a person reads. `storageKey` stays private -- the key shape is an implementation
// detail of load/save, not something a caller should be constructing.

/** Per the status table in
 * `clutch-treasury/docs/superpowers/specs/2026-09-04-redemption-panel-design.md` — the orchestrator
 * keeps returning the raw treasury status; this is where (and only where) it becomes a word a user
 * reads. `payout_pending` and `payout_submitted` deliberately share wording: the distinction
 * matters to an operator, not to someone waiting for money. A status not listed here renders as
 * its own raw string rather than guessing a label. */
export const REDEMPTION_STATUS_LABELS = {
  created: 'Awaiting your burn',
  burn_confirmed: 'Burn confirmed',
  payout_pending: 'Sending USDT',
  payout_submitted: 'Sending USDT',
  paid: 'Paid',
  expired: 'Needs review',
  failed: 'Needs review',
  // Not a treasury status — set by this client alone when the status route 404s (see the poller).
  gone: 'No longer found',
};

/** The orchestrator has no "list my redemptions" route — only `POST /api/v1/redemptions` and
 * `GET /api/v1/redemptions/:id`. So the id of an in-progress redemption has to survive a closed
 * tab locally or it is unrecoverable from this app, which is exactly the "created, then the user
 * closed the tab" case the design requires the panel to survive. Same `clutch_*_<publicKey>`
 * shape as the local tx log (`clutch_tx_<publicKey>`). One in-progress redemption per wallet. */
const storageKey = (publicKey) => `clutch_redemption_${publicKey}`;

export function loadRedemption(publicKey) {
  if (!publicKey) return null;
  try {
    const raw = window.localStorage.getItem(storageKey(publicKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // A record without a server-issued id AND ref is useless: it can neither be polled nor burned
    // against. Dropping it beats rendering half a redemption.
    return parsed && parsed.id && parsed.redemptionRef ? parsed : null;
  } catch {
    return null;
  }
}

export function saveRedemption(publicKey, record) {
  if (!publicKey) return;
  try {
    if (record) window.localStorage.setItem(storageKey(publicKey), JSON.stringify(record));
    else window.localStorage.removeItem(storageKey(publicKey));
  } catch {
    // Private mode / quota. The in-memory record still drives this session; only recovery after a
    // reload is lost, and it is better than failing the withdrawal over a storage error.
  }
}

/** Same defensive shape as `formatDepositAmount` in `DepositPanel.jsx`, for the same reason:
 * `formatExactUsdt` throws on anything it cannot read as a non-negative integer, and this app has
 * no error boundary, so one bad stored value would blank the whole panel. Trailing zeros are
 * trimmed to a minimum of two decimals — lossless, since only zeros are removed.
 *
 * `formatExactUsdt` and not `formatUsd`, for the same reason the deposit amount uses it:
 * `formatUsd` FLOORS to cents, and a burn amount has to display exactly — this number is what
 * gets destroyed. Both read the same 1e6 scale (`formatUsd` divides by 10,000 to cents and then
 * by 100 to dollars), which is the scale `parseUsdToClt` produces and the scale the
 * orchestrator's own bounds are written in (`min_redemption_clt = 10000000`, i.e. 10 CLT). */
export function formatCltAmount(baseUnits) {
  try {
    const [whole, frac] = formatExactUsdt(baseUnits).split('.');
    return `${whole}.${frac.replace(/0+$/, '').padEnd(2, '0')}`;
  } catch {
    return '—';
  }
}

/** What actually arrives, in base units, as a string.
 *
 * The treasury quotes two numbers: the CLT to burn and the USDT that will be paid after its
 * redemption fee. They are equal only where no fee is configured. Falls back to the burn amount
 * because a record stored before this app knew about fees has no net on it, and because an
 * orchestrator too old to send one is by definition charging nothing — in both cases par is the
 * true answer, not a guess.
 */
export function netOf(record) {
  return record?.payoutAmountUsdt ?? record?.amountClt;
}

/** The fee as base units, or `0n` when there is none to show. */
export function feeOf(record) {
  try {
    return BigInt(record.amountClt) - BigInt(netOf(record));
  } catch {
    return 0n;
  }
}
