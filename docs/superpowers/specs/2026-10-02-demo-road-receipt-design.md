# Demo app: the road and the receipt

Date: 2026-10-02. Status: draft, for review.
Scope: `apps/demo` in this repo. It is served at `app-stage.clutchprotocol.io` and `app.clutchprotocol.io` from one build; the host name picks the chain.

## Why

The marketing site got a new look on 2026-10-02 ([clutchprotocol.github.io#5](https://github.com/clutchprotocol/clutchprotocol.github.io/pull/5)): the road, a yellow lane line, a highway-sign green and a thermal ride receipt. The app still has the old Stitch look (blue, glass panels, emoji icons), so the two do not look like one product.

Problems seen on the live app on 2026-10-02:

- The nav labels are cut off on desktop ("Rid…", "Re…").
- The left panel is a tall empty box.
- Icons are emoji. The `Block explorer` and `Sign out` menu buttons look disabled.
- The logo says "Clutch Stage" on mainnet too (`App.jsx`, hard-coded).
- Text is small (11 to 13 px in many places).

## Goals

- One brand with the site: same palette, same type, same road and receipt ideas.
- The trip is a receipt. This is the one bold thing in the app.
- A test network says so on every screen. The mainnet does not.
- Readable on a phone: 16 px base text, 44 px primary buttons, visible focus.

## Not in this change

New features, data flow, SDK or API changes, dark mode (removed on purpose on 2026-09-13), other languages, the `/explorer/` route, `favicon.ico`.

## Design

### Tokens

`src/index.css` holds the palette. The values are the same as `:root` in the site's `styles.css`:

| Name | Value | Use |
|---|---|---|
| asphalt | `#14181c` | text, top bar, nav, strong rules |
| concrete | `#eceee8` | app background, sheets |
| paper | `#fdfdf8` | receipts, inputs, cards |
| sign | `#0a5c45` | main buttons, pickup pin, "paid" |
| lane | `#e8b923` | route line, active mark, test network tag |
| caution | `#b8420c` | cancel, errors, drop-off pin |

The old Kinetic Precision names (`--surface-container-*`, `--primary`, `--on-surface`, ...) stay as aliases at the bottom of `:root`. Inline styles in the JSX still use them, so they take the new palette without being edited one by one. New rules use the new names only.

### Type

Barlow Condensed 600 and 700 for titles and big numbers. Barlow 400, 500 and 600 for text. IBM Plex Mono 400 and 500 for addresses, hashes, prices and receipts. Latin subsets only, self-hosted as `woff2` in `src/fonts/` (SIL OFL, licenses next to the files). Text is left-aligned. Numbers in receipts are right-aligned. No all-caps labels.

### Shell

- **Top bar:** asphalt, 52 px, a yellow dashed lane line under it. Left: a two-dash mark and the word "Clutch", then a yellow `Test network` tag on testnet hosts (`IS_TESTNET`). Right: address chip and a `Menu` button. Under 430 px the dash mark is hidden; under 370 px the address chip is hidden too. The tag always stays.
- **Nav:** three text buttons (`Rides`, `Recent`, `More`), no icons. Phone: an asphalt bar at the bottom. At 1024 px and wider: the same buttons sit in the middle of the top bar. The active one has a 4 px yellow mark.
- **Sheet:** concrete, 2 px asphalt edge. On desktop it is only as tall as its content.
- **Overlay panels** (`Recent`, `More`, `Wallet`): a page with a large title, a `Close` button, the lane line under the header and one column of at most 720 px.
- **Menu:** a drawer. The wallet is a green sign card (the site's `try-stage-card` style) with the balance as the biggest number.
- **Entry:** two sign tiles. Passenger is green, driver is asphalt.
- **Ride steps:** four stops on a dashed route. Done stops are green, the current stop is yellow.

### The receipt

`src/components/receipt.jsx` exports `Receipt`, `Row`, `Rule`, `Meter` and `CopyableAddress`. Trip cards (active and completed), the open request with its offers, and the driver's request detail use them. Paper, Plex Mono, dashed rules, a torn bottom edge (same mask as the site's hero receipt). The fare meter has ten segments and fills as the passenger pays.

The only keyframe animation in the app is `.r-print`: a line prints in from the top, in five steps, when it mounts. The `Paid` row and each new offer use it. `prefers-reduced-motion` turns it off. Status dots no longer pulse. Sheet snap and meter fill remain, because they answer a tap.

### Map

- Tiles are shown in grey (`filter` on `.leaflet-tile-pane`). The route and pins are the only colour.
- `RouteLine` (new) draws a route as two polylines: an asphalt casing and a yellow dash on top. A pending request uses a grey variant.
- Pins are round, ringed in asphalt, with a letter (P, D), so colour is never the only cue. The anchor moves to the centre of the marker.
- The route is still a straight line from pickup to drop-off, as today.

### Environment

- The top bar tag and the PWA name come from the host. `Clutch Stage` is removed from `App.jsx` and from the manifest name (`Clutch`).
- `theme-color` and the manifest colours become asphalt `#14181c`.
- `public/clutch-logo.svg` becomes an asphalt square with two yellow dashes (the same mark as the top bar). It is full-bleed so the PWA mask works.

### Accessibility floor

Body text 16 px. Inputs 16 px (no iOS zoom). Primary and secondary buttons at least 44 px high (40 px inside receipts). Focus ring: 3 px asphalt, yellow on dark bars. The main text pairs were checked against 4.5:1: white on `sign` 8:1, `caution` on paper 5.5:1, muted on concrete 5.2:1, `lane` on asphalt 9.7:1. Icons are gone, so buttons carry words (the sheet drag handle has an `aria-label`; Leaflet's zoom buttons are Leaflet's own).

## Files

CSS (all rewritten in place, import order in `App.css` unchanged): `index.css`, `styles/shell.css`, `entry.css`, `wallet.css`, `primitives.css`, `map.css`, `sections.css`, `explorer.css`, `forms.css`, `trip.css`, `responsive.css`, `overlays.css`.

JSX: `App.jsx`, `ActiveTripCard.jsx`, `CompletedTripCard.jsx`, `RideRequestCard.jsx`, `DriverView.jsx`, `PassengerView.jsx`, `NetworkView.jsx`, `RoleEntry.jsx`, `TransactionHistoryPage.jsx`, `layout/OverlayPanel.jsx`, `utils/mapMarkers.js`, `main.jsx`. New: `receipt.jsx`, `RouteLine.jsx`. Deleted: `Icon.jsx` (its two uses go).

Other: `src/fonts/*` (7 `woff2`, 3 licenses), `utils/paidPercent.js` and `utils/paidPercent.test.js` (a new file with no imports, because `money.js` imports the SDK and the test should not need an SDK build), `public/clutch-logo.svg`, `public/manifest.webmanifest`, `vite.config.js` (manifest), `index.html` (`theme-color`, iOS status bar style `black`), `apps/demo/CLAUDE.md` (styling section).

## Verification

No local build (house rule). CI is the gate: lint, `npm test` and the image build. A new test, `utils/paidPercent.test.js`, covers `paidPercent` (zero fare, partial, full, overpaid). Visual checks: the design board screenshots from this review are the reference; after the merge, compare stage at 360, 390, 430 and 1280 px.

## Rollout

Merge to `main` builds the demo image; the `deploy-stage` pin puts it on stage. Mainnet changes only through `mainnet-app-up.yml`, when the maintainer runs it. The service worker is `prompt` mode, so people see the "new version" bar and choose when to reload.

## Risks

- CSS cannot be checked without a build. The board mocks and the stage deploy are the check. Mainnet waits until stage looks right.
- `:has()` marks the current stop. Browsers without it show all done stops in green. Fine.
- The unused `@fontsource/*` and `material-symbols` packages stay in `package.json`; removing them needs `npm install` to refresh the lockfile. Follow-up.
- `favicon.ico` is still the old purple mark. Follow-up (needs an image tool).
- The site's own `CLAUDE.md` still says Inter and Font Awesome while its CSS uses Barlow. Not part of this change.

## Rejected in review

A dark glass bottom bar, numbered steps and small all-caps labels. They are the common ride-app and Stitch defaults.
