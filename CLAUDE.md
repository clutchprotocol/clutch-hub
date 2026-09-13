# clutch-hub-demo-app — CLAUDE.md

Reference passenger/driver UI for Clutch Protocol. React 19 + Vite 6 + react-leaflet 5, plain JSX (no TypeScript), PWA-enabled. See the parent `D:\source\clutch\CLAUDE.md` for the workspace-wide architecture; this file covers this repo only.

## Commands

- `npm run dev` — starts Vite on 5173. `predev`/`prebuild` first run `npm run build --prefix ../clutch-hub-sdk-js`, so the sibling SDK repo must exist and build.
- `npm run build` / `npm run lint` (flat-config ESLint 9, JS/JSX only) / `npm run preview`.
- There is no separate production build path. `package.prod.json`, `build:prod`, `install:prod`, and the two PowerShell deploy scripts were deleted on 2026-09-10: all four were broken (`install:prod` stripped vite before invoking it, `deploy-prod.ps1` deleted the lockfile then ran `npm ci`, `restore-dev.ps1` needed an untracked file) and the pin was stuck at SDK `^1.15.0`, which cannot resolve past the 3.0.0 wire-format break. The image build in `Dockerfile` is the production path: it copies both repos, builds the SDK, then runs `npm run build` here.
- `npm test` — Node's own test runner over `src/**/*.test.js`. No framework, no dependency. Only `utils/keystore.test.js` exists so far; it gates the image build in `docker-publish.yml`, because most of what it asserts are refusals and a refusal that silently stops happening looks exactly like success from the UI.
- The test job builds the SDK from ITS own lockfile first, exactly as the Dockerfile does. Installing this app runs the SDK's `prepare` as a `file:` dependency and `--ignore-scripts` does not stop it, so without the SDK's own `node_modules` that build resolves a fresh TypeScript major and dies on options it has removed.

Env vars (Vite, must be prefixed `VITE_`):
- `VITE_API_URL` — Hub API base (default `http://localhost:3000`). Overridden at runtime by hostname sniffing in `src/config.js`: `app-stage.*` → `api-stage.*` (and legacy `stageweb.*`/port-81 mappings) win over the env var.
- `VITE_PUBLIC_NODE_ENDPOINTS` — optional comma-separated node WS URLs, display-only on the About tab (browser never talks to nodes directly).

## Source layout (`src/`)

- `main.jsx` — entry: StrictMode, registers PWA service worker, imports leaflet/fontsource/material-symbols CSS.
- `App.jsx` — the entire "router": no react-router. Local state (`mode`, `activeTab`, `hubSubTab`) switches panels; panels are kept mounted and toggled with `hidden`/`display:none` (deliberate — keeps map + subscriptions alive).
- `config.js` — API_URL resolution, GraphQL HTTP/WS URLs, map tile URL (CARTO Voyager) + attribution.
- `sdkRealtime.js` — `subscribe*Compat` wrappers: use SDK WebSocket subscriptions when the installed SDK exposes them, else fall back to HTTP polling (`pollIntervals.js`: active trips 1.5s; requests 3s; offers 5s). Always use these instead of calling `sdk.subscribe*`/`list*` directly in effects.
- `hooks/useClutchSdk.js` — the one sanctioned way to get an SDK instance: `useClutchSdk(publicKey, '0x0', privateKey)`, memoized per key pair ('0x0' = anonymous read-only). Pass `userProfile.privateKey` when the component makes JWT-guarded calls (`createUnsigned*`, `submitTransaction`, `getAccountBalance`) — `generateToken` requires a signed proof-of-key-ownership challenge. When the key comes from the `usePrivateKeyRequest` modal instead, call `sdk.setPrivateKey(pk)` **before** the first `createUnsigned*` call (see the reordered handlers in PassengerView/DriverView/ActiveTripCard/RideForm).
- `components/`
  - `RoleEntry.jsx` — entry screen: pick passenger/driver, then wallet setup; exports `persistRole`.
  - `WalletBackup.jsx` — `WalletBackupExport` (menu, while connected) and `WalletBackupRestore` (sign-in screen, when not). Separate exports on purpose: the two are needed at different moments.
  - `RideRequestCard.jsx` — one open request and the offers against it; own state and subscription, extracted from `PassengerView`.
  - `MapControls.jsx` — `LocationSelector`, `MapCenterTracker`, `MapFlyToLocation`: headless, render `null`, exist only to reach Leaflet through react-leaflet's context.
  - `KeyStorageNotice.jsx` — shown before a key exists, not after. Not dismissible.
  - `DepositPanel.jsx` / `WithdrawPanel.jsx` — the USDT deposit and redemption rails; they talk to the payment orchestrator directly, not through the SDK or Hub API.
  - `PassengerView.jsx` — largest file: map-based ride builder, open requests + offers, active/recent trips.
  - `DriverView.jsx` — available ride requests, make-offer form, driver trips.
  - `ActiveTripCard.jsx` — shared trip card with pay (passenger-only UI) and cancel (either party) actions.
  - `CompletedTripCard.jsx`, `RideForm.jsx`, `BalanceDisplay.jsx` (balance subscription), `UserProfile.jsx` (generate/import wallet), `TransactionHistory.jsx` / `TransactionHistoryPage.jsx` (local tx log), `GeneralView.jsx` (About/endpoints), `NetworkView.jsx` (network-wide explorer), `ExplorerTabs.jsx`, `MapFitBounds.jsx`, `MapLegend.jsx`, `Icon.jsx`.
  - `layout/` — `Section`, `EmptyState`, `WalletBar`, `useConfirmDialog.jsx`, `usePrivateKeyRequest.jsx` (promise-based modal that collects a private key when none is stored).
  - `RoleSelector.jsx` is legacy — not imported by `App.jsx` (superseded by `RoleEntry`).
- `utils/` — `wallet.js` (secp256k1 + keccak256 keypair generation and `addressFromPrivateKey`, matching hub-api's derivation), `keystore.js` (passphrase-encrypted wallet backup: PBKDF2-SHA256 + AES-GCM via WebCrypto, no dependency), `redemption.js` (withdraw record storage and formatting), `passengerRequests.js`, `address.js` (`truncAddr`), `money.js`, `mapMarkers.js` (leaflet `divIcon`s for pickup/dropoff/current-location).

## State management and data flow

- No Redux/Zustand/Context — plain `useState` in `App.jsx` passed down as props. `userProfile` (`{publicKey, privateKey}`) is the central shared state, lifted to App and updated by `UserProfile` via `onProfileUpdate`.
- Live data comes from per-component SDK subscriptions (`sdkRealtime.js` wrappers) in `useEffect`, each returning a dispose fn. Refresh buttons do one-shot `list*` calls into the same state.
- `refreshBalanceCounter` counters are bumped to force re-fetches after pay/accept.
- Cross-component tx-history sync uses a custom `clutch:tx-updated` window event plus the `storage` event.

## Ride lifecycle (all mutations follow the same 3-step SDK pattern)

`createUnsigned*` → `sdk.signTransaction(unsignedTx, privateKey)` → `sdk.submitTransaction(signature.rawTransaction)`, then `TransactionHistory.addTransaction(publicKey, {...})` (a static helper on the component writing to localStorage).

- Passenger: pick pickup/dropoff on map (click or center-pin "Set" button) → enter fare → `createUnsignedRideRequest` (PassengerView `handleSubmit`). Only one concurrent request/trip is allowed (`hasConcurrent` gates the builder).
- Driver: sees all open requests → `createUnsignedRideOffer` with a counter-fare (DriverView `handleAcceptOffer` — the name is misleading; it *makes* an offer).
- Passenger accepts an offer → `createUnsignedRideAcceptance` (PassengerView `RideRequestCard`); acceptance txHash becomes the active-trip id.
- Payment is incremental: `createUnsignedRidePay({rideAcceptanceTxHash, fare})` in `ActiveTripCard`; trip completes when `farePaid >= fare`. Quick-pay buttons pay fractions; amounts are floored to integers.
- Cancel paths: `createUnsignedRideRequestCancel` (open request, passenger) and `createUnsignedRideCancel` (active trip, either party, confirm dialog).

## Key handling (demo-grade, not production)

- Keys are generated client-side (`utils/wallet.js`) or imported, and stored **in plaintext localStorage** under role-scoped keys: `clutch_{passenger|driver}_{publicKey|privateKey}` (see `UserProfile.jsx`, cleared by App's `handleSignOut`).
- Other localStorage keys: `clutch_demo_role`, `clutch_demo_theme`, `clutch_tx_<publicKey>` (last ~10 local tx records).
- If no private key is stored (import with public key only), every signing action falls back to `usePrivateKeyRequest()`'s modal — and the modal must run **before** `createUnsigned*`, because obtaining a JWT now requires signing an auth challenge. Keys never leave the browser — signing (transactions and auth challenges) is local via the SDK.
- **Backups are encrypted, and that is not negotiable.** `utils/keystore.js` seals the key with a
  user passphrase (PBKDF2-SHA256, 600k iterations, AES-GCM). A plaintext key file would be a tenth
  of the code and would teach the pattern this app exists to discourage. The format is
  `clutch-keystore-1`, deliberately NOT Ethereum keystore v3 — v3 wants scrypt, which WebCrypto
  does not provide, and a file that looks like v3 without being it is worse than one that never
  claimed to be.
- Restore re-derives the address from the decrypted key and refuses the file if it disagrees with
  the `address` field. That field is outside the sealed envelope, so anyone can edit it; without
  the check a backup could name an address whose key it does not hold, and the user would find
  out only when the chain rejected everything they signed.
- Don't "fix" this into a real wallet without discussion, but also never log private keys or send them to the API.

## Gotchas / conventions

- **SDK is aliased to the sibling repo**: `vite.config.js` resolves `clutch-hub-sdk-js` to `../clutch-hub-sdk-js` and excludes it from `optimizeDeps` (avoids stale pre-bundles). SDK behavior changes require rebuilding the SDK — restart `npm run dev` or rerun `npm run build:sdk`.
- **SDK version compat**: newer SDK methods are feature-detected (`typeof sdk.method === 'function'`) with an HTTP-polling fallback, as done throughout `sdkRealtime.js`. The original reason (a prod build pinning an older published SDK) is gone with `package.prod.json`, but keep the guards: they are what lets someone swap the path link for a registry version without the app breaking, and the fallbacks cost nothing.
- **Leaflet icon fix**: every map-rendering component does `delete L.Icon.Default.prototype._getIconUrl` + `mergeOptions` with imported marker PNGs — keep this boilerplate when adding a map, or default markers 404 under Vite.
- Maps in hidden panels: panels stay mounted, so guard leaflet animations (`flyTo`) with container-visibility checks (see `MapFlyToLocation` in PassengerView) — Leaflet throws on hidden/zero-size maps.
- React 19 + StrictMode: effects run twice in dev; subscription effects must return their dispose function (all current ones do). No class components, no react-router, no CSS modules.
- Styling: hand-written CSS. `App.css` is now imports only; the rules live in `src/styles/*.css` (shell, entry, wallet, primitives, map, sections, explorer, forms, trip, responsive, overlays) plus the `index.css` reset, which holds the CSS variables and `data-theme` on `<html>` for dark/light. **The import order in `App.css` is load-bearing** — cascade is source order, and `responsive.css` overrides rules defined above it, so a new sheet goes where its rules belong in that sequence, not at the end. Lots of inline `style={{}}` for one-offs; reuse classes like `card`, `btn-primary`, `status-banner`, `form-row`.
- PWA (`vite-plugin-pwa`) is enabled in dev too — `dev-dist/` is generated service-worker output, don't edit it. Stale SW caches can mask changes; hard-refresh if the app looks outdated.
- Amounts are integer CLT; addresses are Ethereum-style `0x…` and should be compared case-insensitively (see `normAddr` in ActiveTripCard) and displayed with `truncAddr`.
- Default map center is Bandar Abbas (`[27.1883, 56.3772]`); geolocation recenters when permitted.
