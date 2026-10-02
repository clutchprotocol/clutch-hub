import { useState } from 'react';
import { truncAddr } from '../utils/address';
import { paidPercent } from '../utils/paidPercent';

// The receipt is the one bold thing in the app: paper, Plex Mono, dashed rules and a torn edge, like
// the ride receipt on the front page of clutchprotocol.io. Styles are in styles/trip.css.

/** An address or hash that copies when clicked. Shown short; the full value is the tooltip. */
export function CopyableAddress({ address }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };
  return (
    <span
      className="truncate-address"
      onClick={handleCopy}
      title={address}
      style={{ cursor: 'pointer' }}
    >
      {copied ? 'Copied!' : truncAddr(address)}
    </span>
  );
}

/**
 * A strip of thermal paper.
 * `status` is the label at the top right and `tone` its dot: 'live' and 'done' are green,
 * 'cancelled' is yellow with an orange label. `aside` sits between the title and the status
 * (a price badge, for example).
 */
export const Receipt = ({ title, status, tone = 'live', sub, aside, children }) => (
  <div className="receipt-wrap">
    <article className="receipt" aria-label={title}>
      <header className="receipt-head">
        <h3 className="receipt-title">{title}</h3>
        {aside}
        {status && (
          <span className={`receipt-status${tone === 'cancelled' ? ' receipt-status--cancelled' : ''}`}>
            <span className={`status-dot status-dot--${tone === 'cancelled' ? 'warn' : tone}`} />
            {status}
          </span>
        )}
      </header>
      {sub && <p className="receipt-sub">{sub}</p>}
      {children}
    </article>
  </div>
);

/** A dashed line across the receipt. */
export const Rule = () => <hr className="r-rule" />;

/**
 * One line of the receipt: label on the left, value on the right.
 * `print` plays the print-in animation again whenever the value changes (the key makes React
 * mount a fresh element), so a payment shows up as a line being printed.
 */
export const Row = ({ label, children, total = false, print = false }) => (
  <div className={`r-row${total ? ' r-row--total' : ''}`}>
    <span>{label}</span>
    <span key={print ? String(children) : undefined} className={print ? 'r-print' : undefined}>
      {children}
    </span>
  </div>
);

/** The fare meter: ten segments, filled from the left as the fare is paid. `paid` and `total` are CLT bigints. */
export const Meter = ({ paid, total }) => {
  const percent = paidPercent(paid, total);
  return (
    <div
      className="r-meter"
      role="progressbar"
      aria-label="Fare paid"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
    >
      <div className="r-meter-fill" style={{ width: `${percent}%` }} />
    </div>
  );
};
