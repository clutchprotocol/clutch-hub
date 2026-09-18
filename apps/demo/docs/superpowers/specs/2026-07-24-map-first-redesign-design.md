# Map-First Redesign — Design Spec

**Date:** 2026-07-24
**Repo:** clutch-hub-demo-app
**Status:** Approved (design), pending implementation plan

## Goal

Redesign the demo app ("Clutch Stage") from a dashboard layout (sticky header + sidebar + stacked cards around a small map) to a map-first layout in the style of Uber/Bolt/Snapp: full-screen map, floating chrome, bottom sheet for the ride flow. Covers visual polish, UX flows, and mobile experience.

## Approach (approved)

**Restructure the shell, keep the guts.** All SDK/data logic stays untouched:

- `useClutchSdk`, `sdkRealtime.js` subscription wrappers, polling fallbacks
- Private-key-before-`createUnsigned*` ordering (JWT auth challenge)
- `usePrivateKeyRequest` modal, `TransactionHistory.addTransaction` logging
- Panels stay mounted and toggled with `hidden`/`display:none` (keeps maps + subscriptions alive)

Only JSX layout and CSS change. Rejected alternatives: clean rebuild (risk to fragile SDK-compat logic), CSS-only polish (not map-first).

## Non-goals

- No new dependencies (no animation/gesture/router/state libraries)
- No TypeScript, no react-router, no CSS modules — repo conventions stand
- No wallet-security rework (demo-grade localStorage keys stay; see repo CLAUDE.md)
- No SDK or API changes
- No palette rework — existing "Kinetic Precision" tokens in `index.css` stay; spacing/radius tweaks only

## 1. Shell & navigation

Delete: sticky `app-header`, `app-sidebar`, `app-layout` grid, duplicated profile card markup (sidebar + hamburger overlay render the same block twice today).

New structure in `App.jsx`:

- Map fills the viewport (`100dvh`). Each role view owns its full-screen map (PassengerView already has one; DriverView gets one). Hidden panels keep maps mounted — keep the existing Leaflet visibility guards (`MapFlyToLocation` pattern).
- **Top floating pill bar** (overlay, `position: fixed`): logo pill left; wallet chip right (truncated address + live balance, tap to copy); menu button.
- **Menu drawer** (slide-in right): profile card (role avatar, wallet, balance/faucet), theme toggle (moved off main chrome), sign out. Single markup instance — replaces both current copies.
- **Bottom sheet** — new layout component, see §2.
- **Bottom nav** (mobile only, unchanged concept): Ride / Recent / More.
- Desktop ≥1024px: bottom sheet becomes a fixed 400px left panel, full height; bottom nav hidden; nav items move into the panel header as tabs.

## 2. BottomSheet component

`src/components/layout/BottomSheet.jsx` + CSS in `App.css`.

- Mobile (<1024px): fixed to bottom, drag handle, three snap points — peek (~120px, header only), half (~50dvh), full (~85dvh). Content scrolls when at full.
- Drag: pointer events (`pointerdown/move/up`) on the handle, translate + snap on release. ~30 lines, CSS transitions for snapping. No library.
- Desktop (≥1024px): same component renders as a static left panel (400px, full height, no drag handle, no snapping).
- Accessibility: `role="region"`, `aria-label`, handle is a button (keyboard: Enter/Space cycles snap points). Focus stays inside naturally (not a modal — map remains interactive).
- API: `<BottomSheet header={...} snap={...} onSnapChange={...}>{content}</BottomSheet>`. Controlled snap so flows can auto-expand (e.g. offer arrives).

## 3. Passenger flow

Sheet content keyed off the existing state booleans (`hasConcurrent`, `hasActiveTrip`, `pickup`, `dropoff`, `fare`) — the state machine does not change.

1. **Building** (`!hasConcurrent && !hasActiveTrip`): sheet header "Where to?", step indicator (pickup → dropoff → fare → confirm). Center-pin + "Set pickup/drop-off" button and map-click selection both stay, relocated: step controls live in the sheet, center pin stays on the map. Fare input + confirm button in the sheet (replaces `ride-request-card`). Reset + My location as small floating map buttons (right edge, above sheet).
2. **Waiting** (`hasConcurrent && !hasActiveTrip`): sheet shows the live offers list for the open request (existing `RideRequestCard` logic: offers subscription, accept, cancel request) restyled as sheet rows. Sheet auto-expands to half when the first offer arrives.
3. **Active trip** (`hasActiveTrip`): `ActiveTripCard` content in the sheet — payment progress, quick-pay buttons, cancel. Map fits the trip route (existing `MapFitBounds`).
4. **Status feedback**: `transactionStatus` banners become floating toasts above the sheet — success auto-dismisses (existing 5s timeout), errors stay until dismissed. One new small `Toast` presentational component; state logic unchanged.

Recent rides move out of the passenger panel into the Recent overlay (§5).

## 4. Driver flow

Replaces the card-list-with-mini-maps layout. Logic (`subscribeRideRequestsCompat`, `handleAcceptOffer`, `offerFares`, key-modal ordering) untouched; render layer only.

1. **Browse** (`!hasActiveTrip`): main map shows pickup markers for all open requests. Sheet = compact request list: one row per request — truncated passenger address, fare badge, offer count (coords are not human-meaningful; the map communicates location). Tapping a request selects it: route polyline + both markers draw on the main map (fit bounds), sheet shows detail — existing offers list, fare input (prefilled with requested fare), Make offer button. Back returns to list. Per-request `MapContainer` mini-maps are deleted.
2. **Active trip** (`hasActiveTrip`): trip card in sheet (existing `ActiveTripCard` with cancel), map fits route. Browse list hidden while a trip is active (matches current behaviour).
3. Selected-request state is new local UI state (`selectedRequestTxHash`) in DriverView.

## 5. Recent, Hub, Entry, theming

- **Recent rides**: full-screen overlay panel sliding over the map (both roles). Reuses `CompletedTripCard` + existing recent-trips subscriptions. Passenger/driver recent tabs collapse into this one overlay, driven by current role.
- **Hub** (About / Tx / Network): full-screen overlay with existing `ExplorerTabs` sub-tabs; `GeneralView`, `TransactionHistoryPage`, `NetworkView` reused as-is, restyled via CSS only.
- **Entry** (`RoleEntry`): logic unchanged (role pick → wallet setup → faucet). Restyle: brand gradient background, centered card, larger role buttons.
- **Dark map tiles**: dark theme uses CARTO `dark_all`, light keeps Voyager. `config.js` exports `getMapTileUrl(theme)`; new ~10-line `useTheme()` hook (MutationObserver on `documentElement`'s `data-theme`) so `TileLayer` swaps on toggle. All map components use it.
- Both themes stay; tokens in `index.css` stay.

## 6. CSS strategy

- `App.css`: add shell/sheet/toast/overlay sections; delete dead dashboard sections (header, sidebar, app-layout, menu-card duplicates, passenger-ride-split columns, driver mini-map styles). Net size should shrink or hold (~2200 lines today).
- Reuse existing utility classes (`card`, `btn-primary`, `btn-secondary`, `btn-ghost`, `status-banner`, `fare-badge`, `offer-row`).
- Keep `:focus-visible` outlines, `env(safe-area-inset-bottom)` padding on sheet + bottom nav, reduced-motion: wrap sheet/overlay transitions in `@media (prefers-reduced-motion: no-preference)`.

## 7. Implementation phases

1. **Shell + sheet + passenger building step** — new App shell (pill bar, drawer, bottom nav), `BottomSheet`, PassengerView map goes full-screen, building flow in sheet.
2. **Passenger waiting/trip + toasts** — offers in sheet, active trip in sheet, `Toast` component.
3. **Driver** — full-screen map with request markers, list/detail in sheet, delete mini-maps.
4. **Recent + Hub overlays, Entry restyle, dark tiles** — overlays, `useTheme`, `getMapTileUrl`, RoleEntry restyle.
5. **Cleanup** — delete dead CSS, delete legacy `RoleSelector.jsx`, final lint/build.

Each phase ends green on `npm run build` + `npm run lint`; visual verification in the docker compose stack (user-run).

## 8. Risks / gotchas (carried from repo CLAUDE.md)

- Leaflet throws on hidden/zero-size maps — keep container-visibility guards; DriverView's new full-screen map needs the same guard pattern.
- Leaflet default-icon boilerplate (`delete L.Icon.Default.prototype._getIconUrl` + `mergeOptions`) must stay in every map-rendering component.
- SDK feature-detection with polling fallback must stay (prod pins the published npm SDK).
- PWA service worker can serve stale assets in dev — hard-refresh when verifying.
- React 19 StrictMode double-runs effects — new hooks (`useTheme`, sheet drag) must be idempotent and return cleanups.
