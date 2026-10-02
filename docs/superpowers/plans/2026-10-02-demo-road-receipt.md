# Demo app: the road and the receipt — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `apps/demo` (served at app-stage.clutchprotocol.io and app.clutchprotocol.io) the same road-and-receipt look as clutchprotocol.io: new palette and type, the trip as a receipt, a yellow route line, a `Test network` tag, text nav, no emoji.

**Architecture:** The styles are already rewritten in place (12 CSS files, import order unchanged) and the fonts are in `src/fonts/`; Task 1 commits them. The rest is JSX: two new small modules (`receipt.jsx`, `RouteLine.jsx`) plus a pure helper (`paidPercent`), then each screen is moved onto them. Class names the CSS expects are listed in each task. No data flow, SDK or API change.

**Tech Stack:** React 19, Vite 6, react-leaflet 5, plain JSX (no TypeScript), hand-written CSS, `node --test` for unit tests.

**Spec:** `docs/superpowers/specs/2026-10-02-demo-road-receipt-design.md`

## Global Constraints

- **No local builds, tests or lint.** Never run `npm`, `node`, `npx`, `cargo`, `docker`, `vite`, `eslint` or any test or build command on this machine. CI is the gate. Checks in this plan are `Grep`/`grep` and reading the code.
- **No push, no PR, no merge** until the maintainer says so. Commit on branch `feat/demo-road-receipt` only.
- **Work only in the worktree** `C:\Users\mehran-pc\AppData\Local\Temp\claude\D--source-clutch\e335f6fc-a14a-4484-ab13-4d870c1d1b24\scratchpad\wt-clutch-hub` (Git Bash: `/c/Users/mehran-pc/AppData/Local/Temp/claude/D--source-clutch/e335f6fc-a14a-4484-ab13-4d870c1d1b24/scratchpad/wt-clutch-hub`). Never `git switch`, `git checkout` or `git merge` in `D:\source\clutch\clutch-hub`. Other sessions use that checkout.
- **Commits:** Conventional Commits, scope `demo`. Write the message to a file and use `git commit -F <file>`; never put backticks in `-m`. End the message with the line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Stage only the files of your task (`git add <paths>`), never `git add -A` or `git add .`. If `.git/index.lock` exists, wait 3 seconds and retry.
- **Lint rules that CI does not run but the repo uses:** `no-unused-vars` is an error (names starting with a capital letter or `_` are ignored, so an unused lowercase import such as `truncAddr` fails). React hooks rules apply. Plain JSX, no TypeScript, no CSS modules, no new dependency, and no change to `package.json` or `package-lock.json`.
- **Palette** (exact): asphalt `#14181c`, concrete `#eceee8`, paper `#fdfdf8`, sign `#0a5c45`, lane `#e8b923`, caution `#b8420c`. Same as `:root` in `clutchprotocol.github.io/styles.css`.
- **Copy rules:** sentence case, plain words, no all-caps labels, no emoji, no icons. A button keeps the same name through a flow ("Pay" stays "Pay").
- **Type:** Barlow Condensed (titles, big numbers), Barlow (text), IBM Plex Mono (addresses, hashes, prices, receipts).
- **Motion:** the only ambient motion is `.r-print` (a receipt line printing in). No pulsing dots and no other animation that runs by itself. The meter fill and the sheet slide stay, because they answer a tap.
- **Do not touch:** `packages/sdk`, `services/hub-api`, the SDK calls and signing code inside the components (`handlePay`, `handleCancel`, `handleAcceptOffer`, `handleCancelRequest`, the subscriptions), and anything listed under "Not in this change" in the spec.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/index.css`, `src/styles/*.css` (11 files), `src/fonts/*` | Tokens, type, every rule. Already written. | 1 |
| `src/utils/paidPercent.js` + `.test.js` | Whole percent of a fare paid, bigint safe. | 2 |
| `src/components/receipt.jsx` | `Receipt`, `Row`, `Rule`, `Meter`, `CopyableAddress`. | 3 |
| `src/components/RouteLine.jsx` | A route as two polylines: casing and yellow dash. | 3 |
| `src/utils/mapMarkers.js` | Pins anchor at the marker centre. | 3 |
| `src/components/ActiveTripCard.jsx`, `CompletedTripCard.jsx` | Trip receipts. | 4 |
| `src/components/RideRequestCard.jsx`, `DriverView.jsx` | Request receipts, driver detail, route line. | 5 |
| `src/components/PassengerView.jsx`, `NetworkView.jsx`, `TransactionHistoryPage.jsx`, `RoleEntry.jsx`, `layout/OverlayPanel.jsx`, `Icon.jsx` (deleted) | Route line, plain labels, no emoji, no icon font use. | 6 |
| `src/App.jsx`, `src/main.jsx`, `index.html`, `public/*`, `vite.config.js` | Top bar, tag, text nav, menu, imports, manifest, logo. | 7 |
| `apps/demo/CLAUDE.md` | Styling section matches the new system. | 8 |

`BalanceDisplay.jsx` is in the spec's file list but needs no change: its inline styles already render correctly in the sign card (checked on the design board). Remove it from the list in the PR description.

**Line numbers** in this plan are for the files at `origin/main` (`7dd267b`). They move after the first edit in a file, so every replaced block also names its first and last lines; find the block by those.

---

### Task 1: Commit the new CSS and fonts

The styles were written and checked on the design board during the review. This task only adds one small rule, removes rules for markup that Tasks 6 and 7 delete, and commits.

**Files:**
- Modify: `apps/demo/src/styles/trip.css`, `shell.css`, `entry.css`, `forms.css`, `map.css`
- Create (already on disk): `apps/demo/src/fonts/*.woff2` (7), `apps/demo/src/fonts/LICENSE-*.txt` (3)

**Interfaces:**
- Produces: CSS classes used by later tasks — `.receipt-wrap`, `.receipt`, `.receipt-head`, `.receipt-title`, `.receipt-status`, `.receipt-status--cancelled`, `.receipt-sub`, `.receipt-map`, `.r-rule`, `.r-row`, `.r-row--total`, `.r-row--head`, `.r-meter`, `.r-meter-fill`, `.r-note`, `.r-title`, `.r-text`, `.r-actions`, `.r-amount`, `.r-go`, `.r-narrow`, `.r-print`, `.env-tag`, `.top-pill--logo`, `.top-pill--wallet`, `.top-pill--menu`, `.fare-badge`, `.offer-row`, `.offer-row-driver-meta`, `.offer-row-driver-address`, `.offer-row-driver-label`, `.offer-row-actions`, `.offer-row-price`.

- [ ] **Step 1: Add the `.r-narrow` rule to `trip.css`**

In `apps/demo/src/styles/trip.css`, after the `.r-actions > .r-go { flex: 1; }` block add:

```css
/* A short input that shares its line with the button, such as the driver's offer. */
.r-actions > .r-narrow {
  flex: none;
  width: 7.5rem;
}
```

- [ ] **Step 2: Remove the rules for markup that later tasks delete**

Delete these rule blocks (selector and body) and nothing else:
- `shell.css`: `.bottom-nav-icon { display: none; }`, `.app-menu-section-header { display: none; }`, `.app-menu-profile-avatar { display: none; }`
- `entry.css`: `.role-entry-emoji { display: none; }`
- `forms.css`: `.offer-avatar { display: none; }`
- `map.css`: `.map-gradient-overlay { display: none; }`

- [ ] **Step 3: Check no stale selector is left**

Run (Grep tool, path `apps/demo/src/styles`): pattern `bottom-nav-icon|app-menu-section|app-menu-profile-avatar|role-entry-emoji|offer-avatar|map-gradient-overlay`
Expected: no matches.

- [ ] **Step 4: Commit**

Stage `apps/demo/src/index.css`, `apps/demo/src/styles/`, `apps/demo/src/fonts/`. Message file content:

```
feat(demo): road palette, Barlow type and new styles

Same palette and type as clutchprotocol.io: asphalt, concrete, sign green,
lane yellow, Barlow Condensed, Barlow and IBM Plex Mono. All 12 style
files are rewritten in place. The old Kinetic Precision names stay as
aliases so inline styles keep working. Seven woff2 files (SIL OFL, licenses
beside them) are self-hosted in src/fonts.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
```

---

### Task 2: `paidPercent` helper and its test

**Files:**
- Create: `apps/demo/src/utils/paidPercent.js`
- Create: `apps/demo/src/utils/paidPercent.test.js`

**Interfaces:**
- Produces: `paidPercent(paid, total) -> number` — whole percent 0..100. `paid` and `total` accept `bigint`, `number` or numeric `string` (the hub sends money as decimal strings).
- It is a new file with no imports, on purpose: `utils/money.js` imports the SDK, and a test for this must not need the SDK build.

- [ ] **Step 1: Write the test**

`apps/demo/src/utils/paidPercent.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { paidPercent } from './paidPercent.js';

test('a zero or missing fare reads as 0', () => {
  assert.equal(paidPercent(0n, 0n), 0);
  assert.equal(paidPercent(5n, 0n), 0);
});

test('nothing paid reads as 0', () => {
  assert.equal(paidPercent(0n, 100n), 0);
});

test('part paid rounds down', () => {
  assert.equal(paidPercent(1n, 3n), 33);
  assert.equal(paidPercent(3_000_000n, 5_000_000n), 60);
  assert.equal(paidPercent(99n, 100n), 99);
});

test('fully paid reads as 100 and overpaid is held at 100', () => {
  assert.equal(paidPercent(100n, 100n), 100);
  assert.equal(paidPercent(150n, 100n), 100);
});

test('accepts the number and string forms the wire sends', () => {
  assert.equal(paidPercent('2500000', '10000000'), 25);
  assert.equal(paidPercent(1, 4), 25);
});

test('does not lose precision above 2^53', () => {
  const total = 9_007_199_254_740_993n * 10n;
  assert.equal(paidPercent(total / 2n, total), 50);
});
```

- [ ] **Step 2: Write the helper**

`apps/demo/src/utils/paidPercent.js`:

```js
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
```

- [ ] **Step 3: Trace the tests by hand (no local run)**

For each assertion, compute the result from the code and confirm it matches. `1n*100n/3n = 33n`; `3_000_000n*100n/5_000_000n = 60n`; `99n*100n/100n = 99n`; `'2500000'` and `'10000000'` become `2_500_000n` and `10_000_000n`, giving `25n`; `BigInt(1)`, `BigInt(4)` give `25n`; the 2^53 case is `part*100n/whole = 50n` because `total/2n*100n/total = 50n` exactly when `total` is even (`9007199254740993n*10n` is even).
Expected: every assertion holds. CI runs `npm run test --workspace=clutch-hub-demo-app` and picks the file up (`node --test src/`).

- [ ] **Step 4: Commit**

Stage the two files. Message:

```
feat(demo): paidPercent for the fare meter

A bigint-safe whole percent of a fare paid, held to 0..100. The receipt
meter will use it in place of two inline copies of this math.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
```

---

### Task 3: Receipt pieces, route line, centred pins

**Files:**
- Create: `apps/demo/src/components/receipt.jsx`
- Create: `apps/demo/src/components/RouteLine.jsx`
- Modify: `apps/demo/src/utils/mapMarkers.js`

**Interfaces:**
- Consumes: `paidPercent(paid, total)` from `../utils/paidPercent`; `truncAddr(address)` from `../utils/address` (existing, `0x1234...abcd` style).
- Produces (later tasks import these exact names):
  - `Receipt({ title: string, status?: string, tone?: 'live' | 'done' | 'cancelled' (default 'live'), sub?: string, aside?: ReactNode, children })`
  - `Row({ label: string, children, total?: boolean, print?: boolean })`
  - `Rule()`
  - `Meter({ paid: bigint, total: bigint })`
  - `CopyableAddress({ address: string })`
  - default export `RouteLine({ positions: [[lat, lng], [lat, lng]], pending?: boolean })`

- [ ] **Step 1: Create `receipt.jsx`**

```jsx
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
```

- [ ] **Step 2: Create `RouteLine.jsx`**

```jsx
import { Polyline } from 'react-leaflet';

// A route as a road draws it: a dark casing with a yellow dashed centre line on top. `pending` is the
// grey version, for a request no driver has taken and for a cancelled trip.
// The colours are asphalt, lane and paper from index.css, written as hex because Leaflet draws them
// as SVG attributes. The line is straight between the two points: the app has no road routing.
const RouteLine = ({ positions, pending = false }) => (
  <>
    <Polyline
      positions={positions}
      color={pending ? '#5b6460' : '#14181c'}
      weight={pending ? 5 : 7}
      opacity={1}
      lineCap="round"
    />
    <Polyline
      positions={positions}
      color={pending ? '#fdfdf8' : '#e8b923'}
      weight={pending ? 2 : 3.5}
      opacity={1}
      dashArray={pending ? '8 8' : '10 9'}
      lineCap="butt"
    />
  </>
);

export default RouteLine;
```

- [ ] **Step 3: Centre the pin anchors in `mapMarkers.js`**

The pins are round now, so the geographic point is the middle of the circle. In `apps/demo/src/utils/mapMarkers.js`, in both `pickupIcon` and `dropoffIcon` change `iconAnchor: [14, 28],` to `iconAnchor: [14, 14],` and `popupAnchor: [0, -24],` to `popupAnchor: [0, -16],`. Leave `currentLocationIcon` as it is.

- [ ] **Step 4: Static checks**

Grep `apps/demo/src/utils/mapMarkers.js` for `iconAnchor`: expected three lines, two `[14, 14]` and one `[12, 12]`.
Read `receipt.jsx`: every import (`useState`, `truncAddr`, `paidPercent`) is used. Every exported name is a component.

- [ ] **Step 5: Commit**

Stage the three files. Message:

```
feat(demo): receipt pieces and a road-style route line

receipt.jsx has Receipt, Row, Rule, Meter and CopyableAddress. RouteLine
draws a route as an asphalt casing with a yellow dashed line on top, with
a grey version for pending requests. Pins now anchor at their centre.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
```

---

### Task 4: Trip receipts (`ActiveTripCard`, `CompletedTripCard`)

**Files:**
- Modify: `apps/demo/src/components/ActiveTripCard.jsx` (lines 1–38 and 197–335)
- Rewrite: `apps/demo/src/components/CompletedTripCard.jsx`

**Interfaces:**
- Consumes: `Receipt`, `Row`, `Rule`, `Meter`, `CopyableAddress` from `./receipt`; default `RouteLine` from `./RouteLine`; `pickupIcon`, `dropoffIcon` from `../utils/mapMarkers`.
- Produces: the same default exports and props as today (`ActiveTripCard({ trip, passengerPayment, cancelAction })`, `CompletedTripCard({ trip })`). Callers do not change.

- [ ] **Step 1: `ActiveTripCard.jsx` — imports and the local `CopyableAddress`**

Replace lines 1–12 (the imports) with:

```jsx
import React, { useState, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import MapFitBounds from './MapFitBounds';
import RouteLine from './RouteLine';
import { Receipt, Row, Rule, Meter, CopyableAddress } from './receipt';
import { ClutchHubSdk, verifyUnsignedTransaction } from 'clutch-hub-sdk-js';
import { API_URL, CHAIN_ID, MAP_ATTRIBUTION, MAP_TILE_URL } from '../config';
import TransactionHistory from './TransactionHistory';
import { usePrivateKeyRequest } from './layout/usePrivateKeyRequest.jsx';
import { useConfirmDialog } from './layout/useConfirmDialog.jsx';
import { formatUsd, parseUsdToClt } from '../utils/money';
import { pickupIcon, dropoffIcon } from '../utils/mapMarkers';
```

Delete the local `function CopyableAddress({ address }) { ... }` (lines 20–38). Keep `normAddr` (lines 14–18). `truncAddr` and `MapLegend` are no longer imported: the receipt maps are small, so the legend stays on the full-screen maps only.

- [ ] **Step 2: `ActiveTripCard.jsx` — the render**

Keep the `puLat` … `dropoff` constants (original lines 189–195). Replace the final `return (` block of the component, from `  return (` followed by `    <div className="card active-trip-card">` (original line 197) through the closing `  );` that precedes `};` and `export default ActiveTripCard;` (original line 335), with:

```jsx
  return (
    <>
      <Receipt title="Trip receipt" status="In progress" tone="live">
        <Rule />
        <div className="map-wrapper receipt-map">
          <MapContainer center={pickup} zoom={13} style={{ height: 'clamp(120px, 18vh, 160px)', width: '100%' }}>
            <TileLayer url={MAP_TILE_URL} attribution={MAP_ATTRIBUTION} />
            <MapFitBounds positions={[pickup, dropoff]} />
            <RouteLine positions={[pickup, dropoff]} />
            <Marker position={pickup} icon={pickupIcon}>
              <Popup>Pickup</Popup>
            </Marker>
            <Marker position={dropoff} icon={dropoffIcon}>
              <Popup>Dropoff</Popup>
            </Marker>
          </MapContainer>
        </div>
        <Row label="Pickup">{Number(puLat).toFixed(4)}, {Number(puLng).toFixed(4)}</Row>
        <Row label="Drop-off">{Number(doLat).toFixed(4)}, {Number(doLng).toFixed(4)}</Row>
        <Row label="Driver"><CopyableAddress address={trip.driverAddress} /></Row>
        <Row label="Passenger"><CopyableAddress address={trip.passengerAddress} /></Row>
        <Rule />
        <Row label="Fare" total>{formatUsd(totalFare)}</Row>
        <Row label="Paid" print>{formatUsd(farePaid)}</Row>
        <Row label="Left">{formatUsd(remaining)}</Row>
        <Meter paid={farePaid} total={totalFare} />

        {showPayUi && (
          <>
            <Rule />
            <h4 className="r-title">Pay driver</h4>
            <p className="r-text">
              Pay in portions as the ride goes. Up to <strong>{formatUsd(remaining)}</strong> left.
            </p>
            <div className="r-actions">
              <input
                type="text"
                inputMode="decimal"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="input-field r-amount"
                placeholder="Amount ($)"
                aria-label="Amount to pay in dollars"
              />
              <button type="button" className="btn-secondary" onClick={() => setQuickPay(25n, 100n)}>
                25%
              </button>
              <button type="button" className="btn-secondary" onClick={() => setQuickPay(50n, 100n)}>
                50%
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setPayAmount(formatUsd(remaining).slice(1))}
              >
                Remaining
              </button>
              <button
                type="button"
                className="btn-primary r-go"
                disabled={paying || !payAmount}
                onClick={handlePay}
              >
                {paying ? 'Paying…' : 'Pay'}
              </button>
            </div>
            {referrer && (
              <p className="r-note">
                Referrer on this transaction: <CopyableAddress address={referrer} />
              </p>
            )}
            {payError && <div className="status-banner error">{payError}</div>}
          </>
        )}

        {!showPayUi && remaining > 0n && (
          <>
            <Rule />
            <p className="r-text">
              {farePaid > 0n
                ? `Passenger has paid ${formatUsd(farePaid)} / ${formatUsd(totalFare)}.`
                : 'Awaiting passenger payment.'}
            </p>
          </>
        )}

        <Rule />
        <Row label="Acceptance"><CopyableAddress address={trip.txHash} /></Row>
        <Row label="Offer"><CopyableAddress address={trip.rideOfferTxHash} /></Row>

        {canCancel && (
          <>
            <Rule />
            <button type="button" className="btn-danger" disabled={cancelling} onClick={handleCancel}>
              {cancelling ? 'Cancelling…' : 'Cancel ride'}
            </button>
            {cancelError && (
              <div className="status-banner error" style={{ marginTop: '0.5rem' }}>{cancelError}</div>
            )}
          </>
        )}
      </Receipt>
      <ConfirmModal />
      <PrivateKeyModal />
    </>
  );
```

- [ ] **Step 3: Rewrite `CompletedTripCard.jsx`**

Replace the whole file with:

```jsx
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import MapFitBounds from './MapFitBounds';
import RouteLine from './RouteLine';
import { Receipt, Row, Rule, Meter, CopyableAddress } from './receipt';
import { MAP_ATTRIBUTION, MAP_TILE_URL } from '../config';
import { formatUsd } from '../utils/money';
import { pickupIcon, dropoffIcon } from '../utils/mapMarkers';

/** Read-only receipt for recent ride history (completed or cancelled). */
const CompletedTripCard = ({ trip }) => {
  const farePaid = BigInt(trip.farePaid ?? trip.fare_paid ?? 0);
  const totalFare = BigInt(trip.fare);
  const rawStatus = (trip.tripStatus ?? trip.trip_status ?? 'completed').toLowerCase();
  const isCancelled = rawStatus === 'cancelled';

  const puLat = Number(trip.pickupLocation.latitude);
  const puLng = Number(trip.pickupLocation.longitude);
  const doLat = Number(trip.dropoffLocation.latitude);
  const doLng = Number(trip.dropoffLocation.longitude);
  const pickup = [puLat, puLng];
  const dropoff = [doLat, doLng];

  return (
    <Receipt
      title="Trip receipt"
      status={isCancelled ? 'Cancelled' : 'Completed'}
      tone={isCancelled ? 'cancelled' : 'done'}
    >
      <Rule />
      <div className="map-wrapper receipt-map">
        <MapContainer center={pickup} zoom={13} style={{ height: 'clamp(120px, 18vh, 160px)', width: '100%' }}>
          <TileLayer url={MAP_TILE_URL} attribution={MAP_ATTRIBUTION} />
          <MapFitBounds positions={[pickup, dropoff]} />
          <RouteLine positions={[pickup, dropoff]} pending={isCancelled} />
          <Marker position={pickup} icon={pickupIcon}><Popup>Pickup</Popup></Marker>
          <Marker position={dropoff} icon={dropoffIcon}><Popup>Dropoff</Popup></Marker>
        </MapContainer>
      </div>
      <Row label="Pickup">{puLat.toFixed(4)}, {puLng.toFixed(4)}</Row>
      <Row label="Drop-off">{doLat.toFixed(4)}, {doLng.toFixed(4)}</Row>
      <Row label="Driver"><CopyableAddress address={trip.driverAddress} /></Row>
      <Row label="Passenger"><CopyableAddress address={trip.passengerAddress} /></Row>
      <Rule />
      <Row label="Fare" total>{formatUsd(totalFare)}</Row>
      <Row label="Settled">{formatUsd(farePaid)}</Row>
      <Meter paid={farePaid} total={totalFare} />
      <Rule />
      <Row label="Acceptance"><CopyableAddress address={trip.txHash} /></Row>
      <Row label="Offer"><CopyableAddress address={trip.rideOfferTxHash} /></Row>
    </Receipt>
  );
};

export default CompletedTripCard;
```

- [ ] **Step 4: Static checks**

Grep both files for `Polyline|MapLegend|truncAddr|📍|🚗|status-dot--live`: expected no matches.
Read `ActiveTripCard.jsx` top to bottom: every lowercase import is used (`useState`, `useCallback`, `normAddr` function, `formatUsd`, `parseUsdToClt`, `pickupIcon`, `dropoffIcon`, `API_URL`, `CHAIN_ID`, `MAP_ATTRIBUTION`, `MAP_TILE_URL`); `handlePay`, `setQuickPay`, `handleCancel` are unchanged; the JSX tags balance.

- [ ] **Step 5: Commit**

Stage both files. Message:

```
feat(demo): trip cards as receipts

Active and completed trips render as thermal receipts with a route map,
the people and hashes, the fare, what is paid and left, and a ten-segment
meter. The pay and cancel logic is unchanged. The local CopyableAddress
copies are gone: both cards use the one in receipt.jsx.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
```

---

### Task 5: Request receipts (`RideRequestCard`, `DriverView`)

**Files:**
- Modify: `apps/demo/src/components/RideRequestCard.jsx` (imports; lines 156–237)
- Modify: `apps/demo/src/components/DriverView.jsx` (imports; `RequestDetail` return lines 81–146; two `Polyline` uses)

**Interfaces:**
- Consumes: `Receipt`, `Row`, `Rule` from `./receipt`; default `RouteLine` from `./RouteLine`.
- Produces: unchanged component props.

- [ ] **Step 1: `RideRequestCard.jsx` imports**

After line 7 (`import TransactionHistory from './TransactionHistory';`) add:

```jsx
import { Receipt, Rule } from './receipt';
```

- [ ] **Step 2: `RideRequestCard.jsx` render**

Replace the final `return (` block, from `  return (` followed by `    <div className="card" style={{ marginBottom: '1rem' }}>` (original line 156) through the closing `  );` that precedes `};` and `export default RideRequestCard;` (original line 237), with the block below. The long comment on the "Accepting holds the full fare" note is kept word for word.

```jsx
  return (
    <Receipt
      title="Ride request"
      sub={new Date(req.timestamp).toLocaleString()}
      aside={<span className="fare-badge" title={`${req.fare} CLT`}>{formatUsd(req.fare)}</span>}
    >
      <Rule />
      <div className="r-row r-row--head">
        <span>Offers ({offers.length})</span>
        <span className="r-actions">
          <button type="button" className="btn-ghost" onClick={fetchOffers} disabled={loading}>
            {loading ? '...' : 'Refresh'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleCancelRequest}
            disabled={cancelling}
          >
            {cancelling ? 'Cancelling...' : 'Cancel request'}
          </button>
        </span>
      </div>

      {error && <div className="status-banner error">{error}</div>}
      {cancelError && <div className="status-banner error">{cancelError}</div>}
      {acceptError && <div className="status-banner error">{acceptError}</div>}

      {offers.length === 0 && !loading && !error && <p className="r-text">No offers yet.</p>}

      {/*
        Readiness item H1. Accepting is the moment the whole fare leaves the passenger and is
        held for the trip, and it is the moment the passenger gives up the recourse a card
        network would have provided. Neither of those was stated anywhere.
        Shown with the offers rather than in a modal: for play money, a dialog demanding
        acknowledgement of "you have no recourse" is theatre, and it trains people to click
        through exactly the dialog that would matter on a real deployment. A real deployment
        needs acknowledgement rather than display — see the readiness doc.
      */}
      {offers.length > 0 && (
        <div className="status-banner info" role="note">
          Accepting holds the full fare on chain straight away. You sign the payment yourself, so
          there is no card issuer to reverse it and <strong>no arbitration if you and the driver
          disagree</strong> — dispute resolution is not built yet. Either side can cancel before
          the fare is fully paid, and the unpaid part returns to you.
        </div>
      )}

      {offers.map((offer) => (
        <div key={offer.txHash} className="offer-row offer-row--driver r-print">
          <div className="offer-row-driver">
            <div className="offer-row-driver-meta">
              <p className="offer-row-driver-address">{truncAddr(offer.driverAddress)}</p>
              <p className="offer-row-driver-label">Driver</p>
            </div>
          </div>
          <div className="offer-row-actions">
            <div className="offer-row-price" title={`${offer.fare} CLT`}>{formatUsd(offer.fare)}</div>
            <button
              type="button"
              className="btn-primary"
              style={{ marginTop: '0.35rem' }}
              onClick={() => handleAcceptOffer(offer)}
              disabled={!!acceptingOfferTxHash}
            >
              {acceptingOfferTxHash === offer.txHash ? 'Accepting...' : 'Accept'}
            </button>
          </div>
        </div>
      ))}
    </Receipt>
  );
```

- [ ] **Step 3: `DriverView.jsx` imports**

Line 2: change `import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';` to `import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';`.
After line 25 (`import MapLegend from './MapLegend';`) add:

```jsx
import RouteLine from './RouteLine';
import { Receipt, Row, Rule } from './receipt';
```

- [ ] **Step 4: `DriverView.jsx` — `RequestDetail` render**

Replace the `return (` block of `RequestDetail`, from `  return (` followed by `    <div>` and the `← All requests` button (original line 81) through the closing `  );` that precedes `};` and `const DriverView = (` (original line 146), with:

```jsx
  return (
    <div>
      <button type="button" className="sheet-back-btn" onClick={onBack}>← All requests</button>
      <Receipt
        title="Ride request"
        aside={<span className="fare-badge" title={`${req.fare} CLT`}>{formatUsd(req.fare)}</span>}
      >
        <Row label="Passenger">
          <span className="truncate-address" title={req.passengerAddress}>
            {truncAddr(req.passengerAddress)}
          </span>
        </Row>
        <Rule />
        <div className="r-row r-row--head">
          <span>Offers ({offers.length})</span>
          <button type="button" className="btn-ghost" onClick={fetchOffers} disabled={loadingOffers}>
            {loadingOffers ? '...' : 'Refresh'}
          </button>
        </div>
        {offersError && <div className="status-banner error">{offersError}</div>}
        {offers.length === 0 && !loadingOffers && !offersError && <p className="r-text">No offers yet.</p>}
        {offers.map((offer) => (
          <div key={offer.txHash} className="offer-row offer-row--driver r-print">
            <div className="offer-row-driver">
              <div className="offer-row-driver-meta">
                <p className="offer-row-driver-address">{truncAddr(offer.driverAddress)}</p>
                <p className="offer-row-driver-label">Driver</p>
              </div>
            </div>
            <div className="offer-row-price" title={`${offer.fare} CLT`}>{formatUsd(offer.fare)}</div>
          </div>
        ))}
        <Rule />
        <h4 className="r-title">Your offer ($)</h4>
        <div className="r-actions">
          <input
            type="text"
            inputMode="decimal"
            value={offerFares[req.txHash] !== undefined ? offerFares[req.txHash] : formatUsd(req.fare).slice(1)}
            onChange={(e) => handleFareChange(req.txHash, e.target.value)}
            className="input-field r-narrow"
            aria-label="Your offer in dollars"
            disabled={disabled || acceptingTxHash === req.txHash}
          />
          <button
            type="button"
            className="btn-primary r-go"
            disabled={disabled || !!acceptingTxHash || !userProfile.publicKey}
            onClick={() => handleAcceptOffer(req)}
          >
            {acceptingTxHash === req.txHash ? 'Submitting...' : disabled ? 'Finish trip first' : userProfile.publicKey ? 'Make offer' : 'Connect wallet'}
          </button>
        </div>
        {acceptingTxHash === req.txHash && offerReferrer && (
          <p className="r-note">Referrer on this offer: {offerReferrer}</p>
        )}
      </Receipt>
    </div>
  );
```

- [ ] **Step 5: `DriverView.jsx` — the two route lines**

(a) Replace `<Polyline positions={[selPickup, selDropoff]} color="var(--accent)" weight={4} opacity={0.9} />` with `<RouteLine positions={[selPickup, selDropoff]} />`.

(b) Replace the multi-line `<Polyline positions={[ ...tripWithRoute... ]} color="var(--accent)" weight={4} opacity={0.9} />` (inside the `{tripWithRoute && ( <> ... </> )}` block) with:

```jsx
              <RouteLine
                positions={[
                  [Number(tripWithRoute.pickupLocation.latitude), Number(tripWithRoute.pickupLocation.longitude)],
                  [Number(tripWithRoute.dropoffLocation.latitude), Number(tripWithRoute.dropoffLocation.longitude)],
                ]}
              />
```

- [ ] **Step 6: Static checks**

Grep both files for `Polyline|offer-avatar|🚗|Make Offer`: expected no matches in `DriverView.jsx` and `RideRequestCard.jsx`.
Read both files: `truncAddr`, `formatUsd` are still used; `Row` and `Rule` are used in `DriverView.jsx`, `Rule` in `RideRequestCard.jsx`; handlers are untouched.

- [ ] **Step 7: Commit**

Stage both files. Message:

```
feat(demo): ride request and offers as receipts

An open request is a receipt with its offers as lines; each new offer
prints in. The driver's request detail is the same receipt with a
"Your offer" line. Routes use RouteLine. The accept-risk note and its
comment are unchanged.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
```

---

### Task 6: Maps, plain labels and no icon font

**Files:**
- Modify: `apps/demo/src/components/PassengerView.jsx`
- Modify: `apps/demo/src/components/NetworkView.jsx`
- Modify: `apps/demo/src/components/TransactionHistoryPage.jsx`
- Modify: `apps/demo/src/components/RoleEntry.jsx`
- Modify: `apps/demo/src/components/layout/OverlayPanel.jsx`
- Delete: `apps/demo/src/components/Icon.jsx`

**Interfaces:**
- Consumes: default `RouteLine` from `./RouteLine`; `pickupIcon`, `dropoffIcon` from `../utils/mapMarkers`.

- [ ] **Step 1: `PassengerView.jsx`**

Line 2: remove `Polyline` from the react-leaflet import (`import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';`). After line 23 (`import MapLegend from './MapLegend';`) add `import RouteLine from './RouteLine';`.

Replace the three `Polyline` uses:

(a) previous requests (inside the `React.Fragment` keyed by `r.txHash`):
`<Polyline positions={[[r.pickup.lat, r.pickup.lng], [r.dropoff.lat, r.dropoff.lng]]} color="#94a3b8" weight={3} opacity={0.75} />`
becomes
`<RouteLine positions={[[r.pickup.lat, r.pickup.lng], [r.dropoff.lat, r.dropoff.lng]]} pending />`

(b) active trips:
`<Polyline positions={[[Number(t.pickupLocation.latitude), Number(t.pickupLocation.longitude)], [Number(t.dropoffLocation.latitude), Number(t.dropoffLocation.longitude)]]} color="var(--accent)" weight={4} opacity={0.9} />`
becomes
`<RouteLine positions={[[Number(t.pickupLocation.latitude), Number(t.pickupLocation.longitude)], [Number(t.dropoffLocation.latitude), Number(t.dropoffLocation.longitude)]]} />`

(c) the route being built:
```jsx
              <Polyline
                positions={[[pickup.lat, pickup.lng], [dropoff.lat, dropoff.lng]]}
                color="var(--accent)"
                weight={3}
                opacity={0.8}
              />
```
becomes
```jsx
              <RouteLine positions={[[pickup.lat, pickup.lng], [dropoff.lat, dropoff.lng]]} />
```

Map buttons: `{locating ? 'Locating…' : '📍 My location'}` becomes `{locating ? 'Locating…' : 'My location'}`. The reset button text `↺ Reset` becomes `Reset`.

- [ ] **Step 2: `NetworkView.jsx`**

1. Line 2: remove `Polyline` from the react-leaflet import.
2. Delete line 16 `import Icon from './Icon';`. After line 3 (`import MapFitBounds from './MapFitBounds';`) add:
```jsx
import RouteLine from './RouteLine';
import { pickupIcon, dropoffIcon } from '../utils/mapMarkers';
```
3. Delete the line `          <Icon name="sensors" size={22} className="network-sensors-icon" />`.
4. Tabs: remove the three `icon: '...'` fields so the array is
```jsx
          tabs={[
            { id: 'requests', label: 'Ride requests', count: rideRequests.length },
            { id: 'trips', label: 'Active trips', count: activeTrips.length },
            { id: 'recent', label: 'Recent rides', count: recentTrips.length },
          ]}
```
5. Delete the line `                <div className="map-gradient-overlay" />`.
6. Pickup markers: in the `rideRequests.map` Marker add `icon={pickupIcon}` after the `position` prop.
7. Selected route: replace the `<Polyline ... />` and the following `<Marker position=...>` opening with
```jsx
                      <RouteLine
                        positions={[
                          [selectedRequest.pickupLocation.latitude, selectedRequest.pickupLocation.longitude],
                          [selectedRequest.dropoffLocation.latitude, selectedRequest.dropoffLocation.longitude],
                        ]}
                      />
                      <Marker
                        position={[selectedRequest.dropoffLocation.latitude, selectedRequest.dropoffLocation.longitude]}
                        icon={dropoffIcon}
                      >
```
8. Offer rows: replace the whole `offers.map((offer) => ( ... ))` block (starts `offers.map((offer) => (` after the "No offers yet." paragraph, ends with `))` before `)}` of the ternary) with
```jsx
                    offers.map((offer) => (
                      <div key={offer.txHash} className="offer-row offer-row--driver">
                        <div className="offer-row-driver">
                          <div className="offer-row-driver-meta">
                            <p className="offer-row-driver-address">{truncAddr(offer.driverAddress)}</p>
                            <p className="offer-row-driver-label">Driver</p>
                          </div>
                        </div>
                        <div className="offer-row-price" title={`${offer.fare} CLT`}>{formatUsd(offer.fare)}</div>
                      </div>
                    ))
```

- [ ] **Step 3: Delete `Icon.jsx`**

`git rm apps/demo/src/components/Icon.jsx`. Then Grep `apps/demo/src` for `Icon'` and `<Icon`: expected no matches (the only users were the two in `NetworkView.jsx`).

- [ ] **Step 4: `TransactionHistoryPage.jsx`, `RoleEntry.jsx`, `OverlayPanel.jsx`**

`TransactionHistoryPage.jsx`: delete the line `      icon="📋"`.

`RoleEntry.jsx`: delete both emoji spans:
```jsx
            <span className="role-entry-emoji" aria-hidden="true">
              🧍
            </span>
```
and
```jsx
            <span className="role-entry-emoji" aria-hidden="true">
              🚗
            </span>
```

`layout/OverlayPanel.jsx`: in the close button replace the text `×` with `Close` (keep `aria-label="Close"`).

- [ ] **Step 5: Static checks**

Grep `apps/demo/src` (js and jsx) for `Polyline`: expected matches only in `components/RouteLine.jsx`.
Grep `apps/demo/src` for the emoji set `[\u{1F000}-\u{1FFFF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]` in `*.jsx` and `*.js`: expected matches only `DriverView.jsx` (`← All requests`, kept on purpose) and `App.jsx` (removed in Task 7).
Read `NetworkView.jsx`: `truncAddr` and `formatUsd` still used; no `Icon`.

- [ ] **Step 6: Commit**

Stage the six paths (including the deletion). Message:

```
feat(demo): route line and plain labels on maps and panels

Passenger, driver and network maps draw routes with RouteLine, and the
network map uses the lettered pins. Emoji and the icon font are gone from
the entry tiles, tabs, map buttons and panel titles; Icon.jsx is deleted.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
```

---

### Task 7: App shell, imports, manifest and logo

**Files:**
- Modify: `apps/demo/src/App.jsx`
- Modify: `apps/demo/src/main.jsx`
- Modify: `apps/demo/index.html`
- Modify: `apps/demo/public/manifest.webmanifest`
- Modify: `apps/demo/public/clutch-logo.svg`
- Modify: `apps/demo/vite.config.js`

- [ ] **Step 1: `App.jsx` (nine edits)**

1. `import { EXPLORER_URL } from './config';` becomes `import { EXPLORER_URL, IS_TESTNET } from './config';`
2. Hub tabs: replace
```jsx
            { id: 'transactions', label: 'Tx', icon: '📋' },
            { id: 'network', label: 'Network', icon: '🔍' },
```
with
```jsx
            { id: 'transactions', label: 'Transactions' },
            { id: 'network', label: 'Network' },
```
3. Logo pill: replace
```jsx
        <div className="top-pill top-pill--logo">
          <img src="/clutch-logo.svg" alt="Clutch" className="app-logo-icon" width={22} height={22} />
          <span className="top-bar-logo-text">Clutch Stage</span>
        </div>
```
with
```jsx
        <div className="top-pill top-pill--logo">
          <span className="top-bar-logo-text">Clutch</span>
          {/* A test network says so on every screen; the mainnet shows no tag. */}
          {IS_TESTNET && <span className="env-tag">Test network</span>}
        </div>
```
4. Menu button: the text `☰` becomes `Menu`.
5. Nav "Rides": replace the `<span className="bottom-nav-icon" aria-hidden>{mode === 'driver' ? '🚕' : '🚗'}</span>` element (three lines plus closing) so that only `<span className="bottom-nav-label">Rides</span>` remains in that button.
6. Nav "Recent": remove the `bottom-nav-icon` span with `✅`; keep the label span.
7. Nav "More": remove the `bottom-nav-icon` span with `⋯`; keep the label span.
8. Menu close button: the text `×` becomes `Close`.
9. Menu profile: delete the `app-menu-section-header` block (`<div className="app-menu-section-header"><span className="app-menu-section-label">Profile</span></div>`) and the `app-menu-profile-avatar` block (`<div className="app-menu-profile-avatar" aria-hidden>{mode === 'driver' ? 'D' : 'P'}</div>`). The `app-menu-profile-card` and the `Role` and `Wallet` labels stay.

- [ ] **Step 2: `main.jsx`**

Delete these four imports, and keep the rest:
```jsx
import '@fontsource/manrope/index.css'
import '@fontsource/inter/index.css'
import '@fontsource/plus-jakarta-sans/index.css'
import 'material-symbols/outlined.css'
```
The fonts now come from `index.css` (`@font-face`, files in `src/fonts/`). The packages stay in `package.json` (removing them needs `npm install`; follow-up).

- [ ] **Step 3: `index.html`**

Replace the `theme-color` comment and meta with:
```html
    <!-- The top bar is asphalt, so the browser chrome around it is too. -->
    <meta name="theme-color" content="#14181c" />
```
Change `apple-mobile-web-app-status-bar-style` content from `default` to `black`. Keep the rest.

- [ ] **Step 4: Manifest, logo, `vite.config.js`**

`public/manifest.webmanifest`: `"name": "Clutch Stage"` becomes `"name": "Clutch"`; both `"background_color"` and `"theme_color"` become `"#14181c"`.

`vite.config.js` manifest block: `name: 'Clutch Stage'` becomes `name: 'Clutch'`. Replace the comment and the two colours with
```js
        // The top bar's colour (asphalt). The splash screen and the browser bar match it.
        background_color: '#14181c',
        theme_color: '#14181c',
```
`public/clutch-logo.svg`, full content:
```svg
<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="32" height="32" fill="#14181c"/>
  <rect x="6" y="13" width="9" height="6" fill="#e8b923"/>
  <rect x="17" y="13" width="9" height="6" fill="#e8b923"/>
</svg>
```
(Full-bleed on purpose: the PWA icon is `maskable` and the entry screen rounds it with CSS.)

- [ ] **Step 5: Static checks**

Grep `apps/demo/src/App.jsx` for `Clutch Stage|☰|×|🚗|🚕|✅|⋯|📋|🔍|app-logo-icon|bottom-nav-icon|app-menu-section|app-menu-profile-avatar`: expected no matches.
Grep `apps/demo` (excluding `node_modules`) for `fontsource|material-symbols` in `src/main.jsx`: expected no matches. `package.json` still lists them: leave it.
Read `App.jsx` near the top bar and the nav: JSX balances; `IS_TESTNET` is imported and used.

- [ ] **Step 6: Commit**

Stage the six files. Message:

```
feat(demo): top bar with a test network tag, text nav, new logo

The logo text no longer says "Clutch Stage" on mainnet: the tag follows
IS_TESTNET. The nav is three text buttons, the menu has Close and Menu
as words, and the old font and icon packages are no longer imported.
Manifest name and colours, theme-color and the logo follow the new look.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
```

---

### Task 8: Describe the new design system in `apps/demo/CLAUDE.md`

**Files:**
- Modify: `apps/demo/CLAUDE.md`

- [ ] **Step 1: Update four places**

1. In the "Source layout" list, the `main.jsx` line: replace "imports `./pwaUpdate` and the leaflet/fontsource/material-symbols CSS" with "imports `./pwaUpdate`, `index.css` (tokens, fonts) and the Leaflet CSS".
2. In the `components/` list: add after the `Icon.jsx` mention removal. Delete `Icon.jsx` from the list, and add the line
   `- `receipt.jsx` — the receipt pieces (`Receipt`, `Row`, `Rule`, `Meter`, `CopyableAddress`) used by the trip cards, the request card and the driver's request detail. `RouteLine.jsx` — a route as an asphalt casing with a yellow dashed line (`pending` is the grey version).`
3. In `utils/`: add `paidPercent.js` (whole percent of a fare paid, bigint safe, own test).
4. Replace the whole "Styling:" bullet under "Gotchas / conventions" with:

```
- Styling: hand-written CSS, the road look shared with clutchprotocol.io (its `styles.css` `:root` has the same palette). Tokens are in `src/index.css`: asphalt, concrete, paper, sign green, lane yellow, caution, plus the type (Barlow Condensed titles, Barlow text, IBM Plex Mono for addresses, hashes, prices and receipts). The fonts are self-hosted `woff2` in `src/fonts/` (SIL OFL, licenses beside them). The old Kinetic Precision names (`--surface-container-*`, `--primary`, `--on-surface` …) are aliases at the bottom of `:root`; inline styles still use them, new rules should not. `App.css` is imports only; the rules live in `src/styles/*.css` (shell, entry, wallet, primitives, map, sections, explorer, forms, trip, responsive, overlays). **The import order in `App.css` is load-bearing** — cascade is source order, and `responsive.css` overrides rules above it. **One palette, light.** Dark mode was removed on 2026-09-13. The map is shown grey (a CSS filter on `.leaflet-tile-pane`), so the route and pins are the only colour. The trip is a receipt (`trip.css`, `receipt.jsx`); the only motion in the app is `.r-print`, a line printing in. A test network shows a yellow `Test network` tag in the top bar (from `IS_TESTNET`); the mainnet shows none. No icons and no emoji: every control has a text label.
```

- [ ] **Step 2: Check**

Grep `apps/demo/CLAUDE.md` for `Kinetic Precision design|fontsource|Icon.jsx`: expected matches only inside the new Styling bullet (`Kinetic Precision names`).

- [ ] **Step 3: Commit**

Stage the file. Message:

```
docs(demo): describe the road and receipt design system

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
```

---

### Task 9: Whole-branch check, then hand over

**Files:** none changed unless a check fails.

- [ ] **Step 1: Cross-file checks (Grep, no build)**

| Check | Pattern | Where | Expected |
|---|---|---|---|
| No emoji left | the emoji class from Task 6 | `apps/demo/src/**/*.{jsx,js}` | only `← All requests` in `DriverView.jsx` |
| One route drawer | `Polyline` | `apps/demo/src` | only `RouteLine.jsx` |
| No removed names | `Icon\b\|app-logo-icon\|Clutch Stage\|offer-avatar` | `apps/demo/src`, `index.html`, `public`, `vite.config.js` | none |
| CSS classes used by JSX exist | each class from the Task 1 list | `apps/demo/src/styles` | each found |
| Imports resolve | `from './receipt'`, `from './RouteLine'`, `from '../utils/paidPercent'` | `apps/demo/src` | each target file exists |
| New test is picked up | `paidPercent.test.js` | `apps/demo/src/utils` | exists, imports `./paidPercent.js` |

- [ ] **Step 2: Read every changed JSX file once, top to bottom**

Look for: unused lowercase imports or variables; a closing tag missing; `className` typos; `key` missing in `.map`; hooks used conditionally. Fix inline and commit with `fix(demo): ...`.

- [ ] **Step 3: Handover to the maintainer**

Do not push. Report: the branch name, the commit list (`git log --oneline origin/main..HEAD`), what CI will run (`docker-publish.yml`: `npm ci`, SDK build, demo tests incl. `paidPercent.test.js`, SDK tests, then the image build), and ask for the go to push and open the PR.
