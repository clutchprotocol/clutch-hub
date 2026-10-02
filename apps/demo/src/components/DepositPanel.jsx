import React, { useEffect, useRef, useState } from 'react';
import { ClutchHubSdk } from 'clutch-hub-sdk-js';
import { API_URL, CHAIN_ID, IS_TESTNET, ORCHESTRATOR_BASE_URL } from '../config';
import { usePrivateKeyRequest } from './layout/usePrivateKeyRequest.jsx';
import { Row } from './receipt';
import QrCode from './QrCode';
import { formatExactUsdt } from '../utils/money';
import { depositTerms } from '../utils/depositTerms';

/** `truncHash`/`timeAgo`, copied from `TransactionHistory.jsx` (module-private there, not
 * exported) rather than imported — a few duplicated lines beat coupling this panel to a
 * ride-history component. Keep in sync by eye if that file's versions change. */
function truncHash(hash) {
  if (!hash || hash.length < 14) return hash || '';
  return `${hash.slice(0, 8)}...${hash.slice(-4)}`;
}

function timeAgo(timestamp) {
  const diff = Date.now() - timestamp;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(timestamp).toLocaleDateString();
}

/** When the money landed, which is not when this row appeared.
 *
 * `transfer_at` is the TRC-20 event's own block time — what a user means by "when did I send
 * this". `created_at` is when the poller noticed, and the two are days apart whenever an address
 * is polled for the first time after a database reset: deposit addresses are permanent, so an old
 * transfer still sitting at one becomes a brand-new row. On stage that rendered a six-day-old
 * 50 USDT deposit as "7m ago", which reads as a second deposit the user never made.
 *
 * Rows that settled before the orchestrator recorded `transfer_at` have only the row's age to
 * offer, so they say `seen` instead of passing it off as the transfer's. Saying nothing at all
 * would be worse — the hash beside it is the only other clue to which deposit this is. */
function depositTime(d) {
  if (d.transfer_at) return timeAgo(new Date(d.transfer_at).getTime());
  return `seen ${timeAgo(new Date(d.created_at).getTime())}`;
}

/** Per the status table in
 * `clutch-treasury/docs/superpowers/specs/2026-09-04-deposit-history-panel-design.md` — the API
 * keeps returning the raw backend status; this is where (and only where) it becomes a word a user
 * reads. A status not listed here renders as its own raw string rather than guessing a label. */
const DEPOSIT_STATUS_LABELS = {
  confirmed: 'Detected',
  mint_requested: 'Minting',
  credited: 'Credited',
  needs_manual: 'Needs review',
};

/** The dot beside a status, as a `status-dot--` suffix: green once the CLT is in the balance, orange
 * when a person has to look, yellow for everything still moving. A status not listed counts as still
 * moving, the same way an unlisted label shows its raw string. */
const DEPOSIT_STATUS_TONES = {
  credited: 'done',
  needs_manual: 'error',
};

/** `formatExactUsdt` throws on anything it can't read as a non-negative integer — correct for a
 * payment-amount field where a bad value should fail loudly, wrong here: this app has no error
 * boundary, so letting that throw escape render would blank the whole panel (or app) over one bad
 * history row. Also trims trailing zeros down to a minimum of two decimals — `formatExactUsdt`
 * keeps all six for payment fields on purpose, but "50.000000" is just busy in a history row. */
function formatDepositAmount(microUsdt) {
  try {
    const [whole, frac] = formatExactUsdt(microUsdt).split('.');
    return `${whole}.${frac.replace(/0+$/, '').padEnd(2, '0')}`;
  } catch {
    return '—';
  }
}

/** Click-to-copy for the exact address — NOT `truncAddr`'d like ActiveTripCard's CopyableAddress,
 * because truncating the one value that must be pasted exactly defeats the point.
 *
 * Exported for `WithdrawPanel`, which needs the same treatment for the payout address and the
 * redemption reference. Shared rather than copied because the reason it exists (show the whole
 * value, make it pasteable) is identical on both panels. */
export function CopyableValue({ value, className }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(String(value)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };
  return (
    <span className={className} onClick={handleCopy} title="Click to copy" style={{ cursor: 'pointer' }}>
      {copied ? 'Copied!' : value}
    </span>
  );
}

/** The "Copy address" button. The clipboard is missing on a page that is not served over https and
 * can refuse a request, so a failure is written on the button instead of passing without a sign —
 * the address is shown in full beside it, so the user can still select it by hand. */
function CopyButton({ value }) {
  const [state, setState] = useState('idle'); // 'idle' | 'copied' | 'failed'
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const handleCopy = () => {
    const finish = (next) => {
      setState(next);
      clearTimeout(timer.current); // a second click restarts the 1.5 s instead of inheriting the first one's end
      timer.current = setTimeout(() => setState('idle'), 1500);
    };
    if (!navigator.clipboard) {
      finish('failed');
      return;
    }
    navigator.clipboard.writeText(String(value)).then(
      () => finish('copied'),
      () => finish('failed'),
    );
  };
  return (
    <>
      <button type="button" className="btn-primary" onClick={handleCopy}>
        {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : 'Copy address'}
      </button>
      {/* A button's own text change is not reliably read out, so a separate status line says it. */}
      <span className="sr-only" role="status">
        {state === 'copied' ? 'Address copied' : state === 'failed' ? 'Copy failed' : ''}
      </span>
    </>
  );
}

/** The "Share" button: the phone's own share sheet (messages, mail, notes ...) with the address in
 * it. The Web Share API is missing on many desktop browsers, and a button that does nothing is worse
 * than none, so it is simply not drawn there. The promise rejects with `AbortError` when the user
 * closes the sheet without choosing, which is not an error; anything else is logged. */
function ShareButton({ value }) {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return null;
  const handleShare = () => {
    navigator.share({ title: 'My Clutch deposit address', text: String(value) }).catch((err) => {
      if (err?.name !== 'AbortError') console.error('share failed', err);
    });
  };
  return (
    <button type="button" className="btn-secondary" onClick={handleShare}>
      Share
    </button>
  );
}

/**
 * Where to get test USDT, on testnet deployments only.
 *
 * Without this the deposit panel is a dead end for anyone who has not already got Nile USDT: it
 * asks for a token that cannot be bought and has no obvious source. The faucet is the answer and
 * it is not discoverable from here. It pays any Tron address directly, the deposit address
 * included (confirmed 2026-09-10), so there is no wallet to install first.
 *
 * Collapsed by default -- it is a one-time setup step, and expanded it would outweigh the form it
 * sits above for everyone who has already done it.
 *
 * Rendered ONLY when IS_TESTNET (see config.js). "Free" and "not real money" next to a field that
 * takes real money would be actively dangerous on a live deployment.
 */
const TestnetFaucetGuide = () => (
  <details className="deposit-guide">
    <summary>How to get test USDT (testnet only)</summary>
    <div className="deposit-guide-body">
      <p>
        This deployment settles on the <strong>Tron Nile testnet</strong>. The USDT here is test
        currency with no value — you cannot buy it, and nothing you deposit is real money.
      </p>
      <ol>
        <li>Copy the deposit address shown above.</li>
        <li>
          Open the{' '}
          <a href="https://nileex.io/join/getJoinPage" target="_blank" rel="noopener noreferrer">
            Nile faucet
          </a>
          , paste the address into its <strong>USDT</strong> section, pass the human check, and click
          Obtain. It sends 1,000 test USDT straight to that address — no Tron wallet needed.
        </li>
        <li>
          Come back. The deposit shows up here as CLT once the treasury sees it, usually within a
          few minutes.
        </li>
      </ol>
    </div>
  </details>
);

/**
 * "Top up with USDT": when the panel opens, fetches this account's permanent TRC-20 deposit address
 * and shows it the way an exchange does — the network, the address as a QR code and as text with Copy
 * and Share, then what to send. Any amount sent there is credited automatically, with no amount,
 * intent, or poll. The private key is needed only to obtain a hub JWT via `sdk.getAuthHeaders()`,
 * not to sign anything.
 */
const DepositPanel = ({ userProfile, open }) => {
  const [address, setAddress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [unavailable, setUnavailable] = useState(false);
  const [deposits, setDeposits] = useState([]);
  const [terms, setTerms] = useState(null);

  const { PrivateKeyModal, requestPrivateKey } = usePrivateKeyRequest();

  // Fetches the account's permanent deposit address each time the panel opens — that POST IS the
  // "user is about to deposit" signal the backend uses to mark the address hot. `DepositPanel` is
  // permanently mounted by `OverlayPanel` (hidden via CSS, never unmounted — see App.jsx), so `open`
  // is what actually tracks visibility; without it this would fire for every signed-in user on
  // every app load. `userProfile?.publicKey` additionally guards the case where the panel opens
  // before a wallet exists (`userProfile` starts as `{publicKey: '', privateKey: ''}`).
  //
  // The same effect also fetches the caller's recent deposit list and refreshes it on a 10s
  // interval while the panel stays open — a deposit's status moves through confirmed / minting /
  // credited on its own schedule, and this is the only signal a user gets of that without
  // reopening the panel. A failed list refresh is logged and otherwise ignored: it must never
  // clobber the address already on screen.
  useEffect(() => {
    if (!open || !userProfile?.publicKey) return undefined;

    let cancelled = false;
    let intervalId = null;
    let fetching = false; // in-flight guard: a slow response must not be overwritten by a newer one

    const fetchDeposits = async (sdk) => {
      if (fetching) return;
      fetching = true;
      try {
        const authHeaders = await sdk.getAuthHeaders();
        const res = await fetch(`${ORCHESTRATOR_BASE_URL}/api/v1/deposits`, {
          method: 'GET',
          headers: authHeaders,
        });
        if (!res.ok) throw new Error(`deposit list failed (${res.status})`);
        const body = await res.json();
        if (!cancelled) setDeposits(body.deposits || []);
      } catch (err) {
        console.error('deposit list fetch failed', err);
        // Leave the previously-loaded list in place — this is best-effort next to the address.
      } finally {
        fetching = false;
      }
    };

    (async () => {
      setLoading(true);
      setError(null);
      setUnavailable(false);
      // Deliberately NOT setAddress(null) here: a reopen re-POSTs (same address comes back), and
      // blanking the address first would flash the panel to empty on every reopen.
      try {
        const { publicKey, privateKey } = userProfile;
        let pk = privateKey;
        if (!pk) {
          pk = await requestPrivateKey('Enter your private key to see your deposit address:');
          if (!pk) {
            if (!cancelled) setError('Signing cancelled.');
            return;
          }
        }
        const sdk = new ClutchHubSdk(API_URL, publicKey, pk, CHAIN_ID);
        const authHeaders = await sdk.getAuthHeaders();
        const res = await fetch(`${ORCHESTRATOR_BASE_URL}/api/v1/deposits`, {
          method: 'POST',
          headers: authHeaders,
        });
        if (res.status === 503) {
          if (!cancelled) setUnavailable(true);
          return;
        }
        const body = await res.json();
        if (!res.ok) {
          throw new Error(body.error || `deposit request failed (${res.status})`);
        }
        if (!cancelled) {
          setAddress(body.address);
          setTerms(depositTerms(body));
        }

        // Best-effort: only bother once we know deposits are actually on (the POST above didn't
        // 503) and the effect hasn't already been cleaned up while we were awaiting it. Re-check
        // cancelled AFTER the await too — the panel can close while that first fetch is still in
        // flight, and starting the interval unconditionally afterward would leak a timer (holding
        // the private-key-bearing sdk reachable) for the life of the tab.
        if (!cancelled) {
          await fetchDeposits(sdk);
          if (!cancelled) intervalId = setInterval(() => fetchDeposits(sdk), 10000);
        }
      } catch (err) {
        console.error('deposit address fetch failed', err);
        if (!cancelled) setError(err.message || 'Failed to load deposit address');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [open, userProfile, requestPrivateKey]);

  return (
    <div className="card deposit-ticket">
      <div className="deposit-head">
        <h3 className="card-title">Top up with USDT</h3>
        <span className={`network-chip${IS_TESTNET ? ' network-chip--test' : ''}`}>
          {IS_TESTNET ? 'Tron Nile testnet · TRC-20' : 'Tron · TRC-20'}
        </span>
      </div>

      {loading && !address && <p className="deposit-hint">Loading your deposit address…</p>}

      {!loading && !address && unavailable && (
        <div className="status-banner info">
          Top-ups are temporarily unavailable. Please check back later.
        </div>
      )}

      {!loading && !address && error && (
        <div className="status-banner error">{error}</div>
      )}

      {address && (
        <>
          <div className="deposit-main">
            <div className="qr-tile">
              <QrCode value={address} label="QR code of your deposit address" />
            </div>
            <div className="deposit-side">
              <p className="deposit-hint">
                Your permanent deposit address. Scan the code with a wallet app, or copy the address.
              </p>
              <CopyableValue value={address} className="deposit-address" />
              <div className="deposit-actions">
                <CopyButton value={address} />
                <ShareButton value={address} />
              </div>
            </div>
          </div>

          <div className="status-banner warning" role="note">
            {IS_TESTNET ? (
              <>
                <strong>Send only Nile USDT (TRC-20).</strong> Mainnet USDT, TRX or any other token
                sent here cannot be recovered.
              </>
            ) : (
              <>
                <strong>Send only USDT on the TRON network (TRC-20).</strong> Any other token or
                network sent here cannot be recovered.
              </>
            )}
          </div>

          <div className="deposit-rows">
            {terms ? (
              // A GasFree address: the relay's fee comes out of each deposit (GasFree design §2), so the
              // user is told the most it can be, and what to send for anything to be credited.
              <>
                <Row label="Send at least">{terms.sendAtLeast} USDT</Row>
                <Row label="Network fee">up to {terms.feeUpTo} USDT</Row>
                <Row label="Minimum after fee">{terms.minimum} USDT</Row>
              </>
            ) : (
              <Row label="Amount">Any amount</Row>
            )}
            <Row label="Credited as">CLT</Row>
          </div>

          {IS_TESTNET && <TestnetFaucetGuide />}
        </>
      )}

      {deposits.length > 0 && (
        <div>
          <h4 className="r-title">Recent deposits</h4>
          <ul className="deposit-list">
            {deposits.map((d) => (
              <li key={d.id} className="deposit-list-row">
                <span className="deposit-amount">{formatDepositAmount(d.amount_usdt)} USDT</span>
                <span className="deposit-status">
                  <span className={`status-dot status-dot--${DEPOSIT_STATUS_TONES[d.status] ?? 'warn'}`} />
                  {DEPOSIT_STATUS_LABELS[d.status] ?? d.status}
                </span>
                <span className="r-note">{depositTime(d)}</span>
                <span className="deposit-hash">{truncHash(d.tron_tx_id)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <PrivateKeyModal />
    </div>
  );
};

export default DepositPanel;
