# Map-First Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the Clutch Stage demo app from a dashboard layout to a full-screen-map layout with a bottom sheet (mobile) / floating panel (desktop), per the approved spec at `docs/superpowers/specs/2026-07-24-map-first-redesign-design.md`.

**Architecture:** Keep all SDK/data logic (subscriptions, signing order, modals) untouched; replace only the render layer of `App.jsx`, `PassengerView.jsx`, `DriverView.jsx` and add four small presentational pieces (`BottomSheet`, `OverlayPanel`, `Toast`, `useTheme`). Panels stay mounted-and-hidden as today.

**Tech Stack:** React 19, Vite 6, react-leaflet 5, hand-written CSS with existing "Kinetic Precision" tokens. No new dependencies.

## Global Constraints

- No new npm dependencies. No TypeScript, no router, no state library, no CSS modules.
- This repo has **no test suite** (see repo CLAUDE.md). Verification per task = `npm run build` + `npm run lint` green. Visual verification happens in the user-run docker stack at the end.
- Keep Leaflet default-icon boilerplate (`delete L.Icon.Default.prototype._getIconUrl` + `mergeOptions`) in every file that renders a `MapContainer`.
- Keep visibility guards before Leaflet animations (`MapFlyToLocation` pattern) — Leaflet throws on hidden/zero-size maps.
- Keep the private-key-before-`createUnsigned*` ordering in all handlers. Do not touch handler bodies.
- All work on branch `redesign/map-first`. Commit at the end of every task with the message given in the task.
- Copy rule: user-facing product name is "Clutch Stage".
- Deliberate deviations from spec §1 (approved rationale, keep as-is):
  - Top wallet chip shows truncated address + copy only; balance + faucet (`BalanceDisplay`) live in the menu drawer — `BalanceDisplay` contains a nested button (faucet) and cannot legally nest inside the chip `<button>`.
  - Bottom nav stays visible at all widths (floating centered pill on desktop) instead of moving nav tabs into the panel header — simpler, one nav implementation.

---

### Task 1: Theme plumbing (`useTheme` + `getMapTileUrl`)

**Files:**
- Create: `src/hooks/useTheme.js`
- Modify: `src/config.js` (append after line 74)

**Interfaces:**
- Produces: `useTheme(): 'dark' | 'light'` (React hook), `getMapTileUrl(theme: string): string`, `MAP_TILE_URL_DARK: string`. Later tasks import `{ getMapTileUrl }` from `../config` and `{ useTheme }` from `../hooks/useTheme`.

- [ ] **Step 1: Create the hook**

`src/hooks/useTheme.js`:

```js
import { useEffect, useState } from 'react';

const read = () => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

/** Tracks <html data-theme>, which App.jsx sets on theme toggle. */
export function useTheme() {
  const [theme, setTheme] = useState(read);
  useEffect(() => {
    const obs = new MutationObserver(() => setTheme(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);
  return theme;
}
```

- [ ] **Step 2: Add dark tiles to config**

Append to `src/config.js` (after the `MAP_ATTRIBUTION` export):

```js
/** Dark map tiles for the dark theme (CARTO Dark Matter) */
export const MAP_TILE_URL_DARK = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

export const getMapTileUrl = (theme) => (theme === "dark" ? MAP_TILE_URL_DARK : MAP_TILE_URL);
```

- [ ] **Step 3: Verify**

Run: `npm run build` then `npm run lint`. Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useTheme.js src/config.js
git commit -m "feat: theme-aware map tile plumbing (useTheme, getMapTileUrl)"
```

---

### Task 2: BottomSheet, OverlayPanel, Toast components + CSS

**Files:**
- Create: `src/components/layout/BottomSheet.jsx`
- Create: `src/components/layout/OverlayPanel.jsx`
- Create: `src/components/layout/Toast.jsx`
- Modify: `src/components/layout/index.js`
- Modify: `src/App.css` (append new section at end)

**Interfaces:**
- Produces:
  - `<BottomSheet snap onSnapChange header ariaLabel>{children}</BottomSheet>` — `snap: 'peek'|'half'|'full'` (controlled), `onSnapChange(next: string)`, `header: ReactNode` (always visible), children scroll.
  - `<OverlayPanel open title onClose>{children}</OverlayPanel>` — always mounted, toggled with `hidden` + `display:none` (repo convention; keeps inner maps/subscriptions alive).
  - `<Toast status onDismiss />` — `status: { type: 'info'|'success'|'warning'|'error', message: string } | null`. Errors show a dismiss ×; other types rely on the caller's existing auto-clear timeouts.

- [ ] **Step 1: BottomSheet**

`src/components/layout/BottomSheet.jsx`:

```jsx
import React, { useRef, useState } from 'react';

const SNAPS = ['peek', 'half', 'full'];
const isDesktop = () => window.matchMedia('(min-width: 1024px)').matches;

const visibleFor = (s) => {
  const vh = window.innerHeight;
  if (s === 'peek') return 200;
  if (s === 'half') return Math.round(vh * 0.55);
  return Math.round(vh * 0.88);
};

/**
 * Mobile (<1024px): bottom sheet with drag handle and three snap points.
 * Desktop (>=1024px): static floating left panel (CSS only; drag disabled).
 * Controlled: parent owns `snap`.
 */
const BottomSheet = ({ snap = 'half', onSnapChange, header, ariaLabel = 'Ride panel', children }) => {
  const dragState = useRef(null);
  const movedRef = useRef(false);
  const [dragOffset, setDragOffset] = useState(null); // translateY px while dragging

  const handlePointerDown = (e) => {
    if (isDesktop()) return;
    movedRef.current = false;
    dragState.current = { startY: e.clientY, startVisible: visibleFor(snap) };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (!dragState.current) return;
    const dy = e.clientY - dragState.current.startY;
    if (Math.abs(dy) > 6) movedRef.current = true;
    const maxVisible = visibleFor('full');
    const visible = Math.min(maxVisible, Math.max(120, dragState.current.startVisible - dy));
    setDragOffset(maxVisible - visible);
  };

  const handlePointerUp = () => {
    if (!dragState.current) return;
    const maxVisible = visibleFor('full');
    const visible = dragOffset == null ? visibleFor(snap) : maxVisible - dragOffset;
    let best = SNAPS[0];
    let bestDist = Infinity;
    for (const s of SNAPS) {
      const d = Math.abs(visibleFor(s) - visible);
      if (d < bestDist) { bestDist = d; best = s; }
    }
    dragState.current = null;
    setDragOffset(null);
    if (best !== snap) onSnapChange?.(best);
  };

  // Keyboard/click affordance: cycle snap points. Skipped after a real drag.
  const cycleSnap = () => {
    if (movedRef.current) return;
    const idx = SNAPS.indexOf(snap);
    onSnapChange?.(SNAPS[(idx + 1) % SNAPS.length]);
  };

  return (
    <section
      className={`bottom-sheet bottom-sheet--${snap}${dragOffset != null ? ' bottom-sheet--dragging' : ''}`}
      style={dragOffset != null ? { transform: `translateY(${dragOffset}px)` } : undefined}
      aria-label={ariaLabel}
    >
      <button
        type="button"
        className="bottom-sheet-handle"
        aria-label="Resize panel"
        onClick={cycleSnap}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <span className="bottom-sheet-handle-bar" aria-hidden />
      </button>
      {header && <div className="bottom-sheet-header">{header}</div>}
      <div className="bottom-sheet-body">{children}</div>
    </section>
  );
};

export default BottomSheet;
```

- [ ] **Step 2: OverlayPanel**

`src/components/layout/OverlayPanel.jsx`:

```jsx
import React from 'react';

/**
 * Full-screen overlay above the map. Always mounted; toggled with
 * hidden/display:none (repo convention — keeps inner maps and
 * subscriptions alive, same as App's tab panels).
 */
const OverlayPanel = ({ open, title, onClose, children }) => (
  <div
    className="overlay-panel"
    role="dialog"
    aria-label={title}
    hidden={!open}
    style={{ display: open ? 'flex' : 'none' }}
  >
    <div className="overlay-panel-header">
      <h2 className="overlay-panel-title">{title}</h2>
      <button type="button" className="overlay-panel-close" onClick={onClose} aria-label="Close">
        ×
      </button>
    </div>
    <div className="overlay-panel-body">{children}</div>
  </div>
);

export default OverlayPanel;
```

- [ ] **Step 3: Toast**

`src/components/layout/Toast.jsx`:

```jsx
import React from 'react';

/**
 * Floating status toast. Caller owns the status state and its auto-clear
 * timeout (existing behaviour); errors get an explicit dismiss button.
 */
const Toast = ({ status, onDismiss }) => {
  if (!status) return null;
  return (
    <div className="toast-stack">
      <div className={`toast toast--${status.type}`} role="status">
        <span className="toast-message">{status.message}</span>
        {status.type === 'error' && (
          <button type="button" className="toast-dismiss" onClick={onDismiss} aria-label="Dismiss">
            ×
          </button>
        )}
      </div>
    </div>
  );
};

export default Toast;
```

- [ ] **Step 4: Export from layout barrel**

`src/components/layout/index.js` becomes:

```js
export { default as Section } from './Section';
export { default as WalletBar } from './WalletBar';
export { default as EmptyState } from './EmptyState';
export { default as BottomSheet } from './BottomSheet';
export { default as OverlayPanel } from './OverlayPanel';
export { default as Toast } from './Toast';
```

- [ ] **Step 5: Append CSS**

Append to `src/App.css`:

```css
/* ===== Map-first shell ===== */
.app-shell {
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: var(--background);
}

.view-layer,
.mapfirst-view,
.mapfirst-map,
.mapfirst-map .leaflet-container {
  position: absolute;
  inset: 0;
}

.mapfirst-map .leaflet-container {
  height: 100%;
  width: 100%;
}

.top-bar {
  position: fixed;
  top: calc(0.75rem + env(safe-area-inset-top));
  left: 0.75rem;
  right: 0.75rem;
  z-index: 1050;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  pointer-events: none;
}

.top-bar > * {
  pointer-events: auto;
}

.top-pill {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.85rem;
  border-radius: var(--radius-full);
  background: var(--glass-bg-strong);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
  color: var(--text-primary);
  font-size: 0.85rem;
  font-weight: 600;
}

.top-bar-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.top-pill--logo .app-logo-icon {
  width: 22px;
  height: 22px;
}

.top-pill--logo .top-bar-logo-text {
  font-family: var(--font-headline);
  font-weight: 800;
  font-style: italic;
  letter-spacing: -0.03em;
  color: var(--primary-container);
}

button.top-pill {
  cursor: pointer;
}

button.top-pill:hover {
  background: var(--surface-container-high);
}

.top-pill--wallet {
  font-family: var(--font-label);
  font-size: 0.8rem;
}

.top-pill--menu {
  padding: 0.45rem 0.7rem;
  font-size: 1rem;
  line-height: 1;
}

/* ===== Bottom sheet ===== */
.bottom-sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1010;
  height: 88dvh;
  display: flex;
  flex-direction: column;
  background: var(--glass-bg-strong);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--border);
  border-bottom: none;
  border-radius: var(--radius-xl) var(--radius-xl) 0 0;
  box-shadow: var(--shadow-lg);
  transform: translateY(calc(88dvh - 55dvh));
  touch-action: none;
}

@media (prefers-reduced-motion: no-preference) {
  .bottom-sheet {
    transition: transform 0.25s ease;
  }
}

.bottom-sheet--dragging {
  transition: none;
}

.bottom-sheet--peek {
  transform: translateY(calc(88dvh - 200px));
}

.bottom-sheet--half {
  transform: translateY(calc(88dvh - 55dvh));
}

.bottom-sheet--full {
  transform: translateY(0);
}

.bottom-sheet-handle {
  flex-shrink: 0;
  width: 100%;
  padding: 0.6rem 0 0.35rem;
  background: transparent;
  display: flex;
  justify-content: center;
  cursor: grab;
}

.bottom-sheet-handle-bar {
  width: 42px;
  height: 4px;
  border-radius: var(--radius-full);
  background: var(--outline-variant);
}

.bottom-sheet-header {
  flex-shrink: 0;
  padding: 0 1rem 0.65rem;
}

.bottom-sheet-body {
  flex: 1;
  overflow-y: auto;
  padding: 0 1rem calc(84px + env(safe-area-inset-bottom));
  overscroll-behavior: contain;
}

@media (min-width: 1024px) {
  .bottom-sheet {
    left: 0.75rem;
    right: auto;
    top: calc(4.25rem + env(safe-area-inset-top));
    bottom: 0.75rem;
    width: 400px;
    height: auto;
    transform: none !important;
    border-radius: var(--radius-xl);
    border-bottom: 1px solid var(--border);
    touch-action: auto;
  }

  .bottom-sheet-handle {
    display: none;
  }

  .bottom-sheet-body {
    padding-bottom: 1rem;
  }
}

/* ===== Floating map action buttons ===== */
.map-fabs {
  position: fixed;
  right: 0.75rem;
  bottom: calc(216px + env(safe-area-inset-bottom));
  z-index: 1005;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.map-fab {
  padding: 0.55rem 0.8rem;
  border-radius: var(--radius-full);
  background: var(--glass-bg-strong);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
  color: var(--text-primary);
  font-size: 0.8rem;
  font-weight: 600;
}

.map-fab:hover {
  background: var(--surface-container-high);
}

@media (min-width: 1024px) {
  .map-fabs {
    bottom: 1.5rem;
  }
}

/* ===== Toast ===== */
.toast-stack {
  position: fixed;
  top: calc(4rem + env(safe-area-inset-top));
  left: 50%;
  transform: translateX(-50%);
  z-index: 1200;
  width: min(92vw, 420px);
  display: flex;
  justify-content: center;
  pointer-events: none;
}

.toast {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  max-width: 100%;
  padding: 0.6rem 0.9rem;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  background: var(--glass-bg-strong);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  box-shadow: var(--shadow-md);
  font-size: 0.85rem;
  color: var(--text-primary);
}

.toast--success { border-color: var(--success); }
.toast--error { border-color: var(--error); }
.toast--warning { border-color: var(--warning); }
.toast--info { border-color: var(--primary-container); }

.toast-dismiss {
  background: transparent;
  color: var(--text-secondary);
  font-size: 1rem;
  line-height: 1;
  padding: 0 0.2rem;
}

/* ===== Full-screen overlay panel ===== */
.overlay-panel {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  flex-direction: column;
  background: var(--background);
}

.overlay-panel-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: calc(0.9rem + env(safe-area-inset-top)) 1.25rem 0.9rem;
  border-bottom: 1px solid var(--border);
}

.overlay-panel-title {
  margin: 0;
  font-family: var(--font-headline);
  font-size: 1.15rem;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.overlay-panel-close {
  background: var(--surface-container-high);
  color: var(--text-primary);
  border-radius: var(--radius-full);
  width: 34px;
  height: 34px;
  font-size: 1.1rem;
  line-height: 1;
}

.overlay-panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 1rem 1.25rem calc(2rem + env(safe-area-inset-bottom));
  max-width: 900px;
  width: 100%;
  margin: 0 auto;
}

/* ===== Sheet content helpers ===== */
.sheet-title {
  margin: 0 0 0.15rem;
  font-family: var(--font-headline);
  font-size: 1.05rem;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.sheet-subtitle {
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.sheet-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.sheet-step-pills {
  display: flex;
  gap: 0.35rem;
  margin-top: 0.5rem;
}

.sheet-step-pill {
  flex: 1;
  height: 4px;
  border-radius: var(--radius-full);
  background: var(--surface-container-highest);
}

.sheet-step-pill--done {
  background: var(--primary-container);
}

.request-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  width: 100%;
  text-align: left;
  padding: 0.7rem 0.75rem;
  margin-bottom: 0.5rem;
  border-radius: var(--radius-md);
  background: var(--surface-container);
  border: 1px solid var(--border);
  color: var(--text-primary);
}

.request-row:hover {
  background: var(--surface-container-high);
}

.request-row-main {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

.request-row-address {
  font-family: var(--font-label);
  font-size: 0.85rem;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.request-row-meta {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.sheet-back-btn {
  background: transparent;
  color: var(--primary);
  font-size: 0.85rem;
  font-weight: 600;
  padding: 0.25rem 0;
}
```

- [ ] **Step 6: Verify**

Run: `npm run build && npm run lint`. Expected: exit 0 (components not yet imported anywhere — lint must not flag unused files; it lints per-file).

- [ ] **Step 7: Commit**

```bash
git add src/components/layout/ src/App.css
git commit -m "feat: BottomSheet, OverlayPanel, Toast primitives for map-first shell"
```

---

### Task 3: App shell restructure

**Files:**
- Modify: `src/App.jsx` (replace the signed-in return block, lines 137–475; keep all state/handlers, lines 1–135)
- Modify: `src/App.css` (bottom-nav desktop rule)

**Interfaces:**
- Consumes: `OverlayPanel` from `./components/layout`.
- Produces for Tasks 4–5: views receive one new optional prop `onTabSync(tab: string)` — views call it when they change their internal tab locally (e.g. closing the Recent overlay) so App's `passengerViewTab`/`driverViewTab` stays in sync and nav re-clicks keep firing.

- [ ] **Step 1: Replace the signed-in JSX in `App.jsx`**

Add import: `import { OverlayPanel } from './components/layout';`

Replace everything inside `return (` for the signed-in case (the current `<div className="app">…</div>`) with:

```jsx
    <div className="app-shell">
      <div
        className="view-layer"
        role="tabpanel"
        id="role-panel-passenger"
        hidden={activeTab !== 'passenger'}
        style={{ display: activeTab === 'passenger' ? 'block' : 'none' }}
      >
        <PassengerView
          userProfile={userProfile}
          onProfileUpdate={setUserProfile}
          refreshTrigger={walletRefresh}
          onFaucetSuccess={() => setWalletRefresh((c) => c + 1)}
          externalTab={passengerViewTab}
          onTabSync={setPassengerViewTab}
        />
      </div>
      <div
        className="view-layer"
        role="tabpanel"
        id="role-panel-driver"
        hidden={activeTab !== 'driver'}
        style={{ display: activeTab === 'driver' ? 'block' : 'none' }}
      >
        <DriverView
          userProfile={userProfile}
          onProfileUpdate={setUserProfile}
          refreshTrigger={walletRefresh}
          onFaucetSuccess={() => setWalletRefresh((c) => c + 1)}
          externalTab={driverViewTab}
          onTabSync={setDriverViewTab}
        />
      </div>

      <header className="top-bar">
        <div className="top-pill top-pill--logo">
          <img src="/clutch-logo.svg" alt="Clutch" className="app-logo-icon" width={22} height={22} />
          <span className="top-bar-logo-text">Clutch Stage</span>
        </div>
        <div className="top-bar-right">
          {userProfile.publicKey && (
            <button
              type="button"
              className="top-pill top-pill--wallet"
              title={userProfile.publicKey}
              onClick={handleCopyWalletAddress}
            >
              {walletCopied ? 'Copied!' : truncAddr(userProfile.publicKey)}
            </button>
          )}
          <button
            type="button"
            className="top-pill top-pill--menu"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          >
            ☰
          </button>
        </div>
      </header>

      <OverlayPanel
        open={activeTab === 'hub'}
        title="About & network"
        onClose={() => setActiveTab(mode)}
      >
        <ExplorerTabs
          tabs={[
            { id: 'about', label: 'About', icon: 'ℹ️' },
            { id: 'transactions', label: 'Tx', icon: '📋' },
            { id: 'network', label: 'Network', icon: '🔍' },
          ]}
          activeTab={hubSubTab}
          onTabChange={setHubSubTab}
          showCounts={false}
        />
        <div role="tabpanel" id="panel-about" aria-labelledby="tab-about" hidden={hubSubTab !== 'about'} style={{ display: hubSubTab === 'about' ? 'block' : 'none' }}>
          <GeneralView />
        </div>
        <div role="tabpanel" id="panel-transactions" aria-labelledby="tab-transactions" hidden={hubSubTab !== 'transactions'} style={{ display: hubSubTab === 'transactions' ? 'block' : 'none' }}>
          <TransactionHistoryPage userPublicKey={userProfile.publicKey} />
        </div>
        <div role="tabpanel" id="panel-network" aria-labelledby="tab-network" hidden={hubSubTab !== 'network'} style={{ display: hubSubTab === 'network' ? 'block' : 'none' }}>
          <NetworkView />
        </div>
      </OverlayPanel>

      <nav className="bottom-nav" aria-label="App navigation">
        <button
          type="button"
          className={`bottom-nav-item ${activeTab === mode && !isRecentRidesActive ? 'active' : ''}`}
          onClick={() => {
            if (mode === 'driver') {
              setDriverViewTab('rides');
              setActiveTab('driver');
            } else {
              setPassengerViewTab('rides');
              setActiveTab('passenger');
            }
          }}
        >
          <span className="bottom-nav-icon" aria-hidden>{mode === 'driver' ? '🚕' : '🚗'}</span>
          <span className="bottom-nav-label">Rides</span>
        </button>
        <button
          type="button"
          className={`bottom-nav-item ${isRecentRidesActive ? 'active' : ''}`}
          onClick={() => {
            if (mode === 'driver') {
              setDriverViewTab('recent');
              setActiveTab('driver');
            } else {
              setPassengerViewTab('recent');
              setActiveTab('passenger');
            }
          }}
        >
          <span className="bottom-nav-icon" aria-hidden>✅</span>
          <span className="bottom-nav-label">Recent</span>
        </button>
        <button
          type="button"
          className={`bottom-nav-item ${activeTab === 'hub' ? 'active' : ''}`}
          onClick={() => setActiveTab('hub')}
        >
          <span className="bottom-nav-icon" aria-hidden>⋯</span>
          <span className="bottom-nav-label">More</span>
        </button>
      </nav>

      {menuOpen && (
        <div className="app-menu-overlay" onClick={() => setMenuOpen(false)}>
          <aside className="app-menu" onClick={(e) => e.stopPropagation()}>
            <div className="app-menu-top-row">
              <span className="app-menu-title">Menu</span>
              <button type="button" className="app-menu-close-btn" onClick={() => setMenuOpen(false)} aria-label="Close menu">
                ×
              </button>
            </div>
            <div className="card app-menu-card">
              <div className="app-menu-section-header">
                <span className="app-menu-section-label">Profile</span>
              </div>
              <div className="app-menu-profile-card">
                <div className="app-menu-profile-head">
                  <div className="app-menu-profile-avatar" aria-hidden>{mode === 'driver' ? 'D' : 'P'}</div>
                  <div>
                    <div className="app-menu-profile-role-label">Role</div>
                    <div className="app-menu-profile-role-value">
                      <span style={{ textTransform: 'capitalize' }}>{mode}</span>
                    </div>
                  </div>
                </div>
                <div className="app-menu-profile-wallet">
                  <div className="app-menu-profile-role-label">Wallet</div>
                  {userProfile.publicKey ? (
                    <div className="app-menu-profile-wallet-row">
                      <button
                        type="button"
                        className="app-menu-wallet-address"
                        title={userProfile.publicKey}
                        onClick={handleCopyWalletAddress}
                      >
                        {walletCopied ? 'Copied!' : truncAddr(userProfile.publicKey)}
                      </button>
                      <BalanceDisplay
                        publicKey={userProfile.publicKey}
                        onFaucetSuccess={() => setWalletRefresh((c) => c + 1)}
                      />
                    </div>
                  ) : (
                    <span className="app-menu-profile-wallet-empty">Not connected</span>
                  )}
                </div>
              </div>
              <div className="app-menu-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={toggleTheme}
                >
                  {theme === 'dark' ? 'Light mode' : 'Dark mode'}
                </button>
                <button
                  type="button"
                  className="btn-secondary app-menu-signout-btn"
                  onClick={() => {
                    setMenuOpen(false);
                    handleSignOut();
                  }}
                >
                  Sign out
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
```

Notes:
- The old sticky `<header className="app-header">`, `<div className="app-layout">`, `<aside className="app-sidebar">` and the second (sidebar) profile-card copy are gone.
- The hub `<main>` wrapper is gone; hub content now lives in `OverlayPanel`.
- All state and handlers above the return stay byte-identical.

- [ ] **Step 2: Bottom nav visible at all widths**

In `src/App.css`, the existing `.bottom-nav { display: none; …}` plus a media query currently shows it only on mobile. Change so the nav is a floating pill at every width: set `display: flex` on the base rule, and add:

```css
@media (min-width: 1024px) {
  .bottom-nav {
    left: 50%;
    right: auto;
    bottom: 1rem;
    width: auto;
    transform: translateX(-50%);
    border: 1px solid var(--border);
    border-radius: var(--radius-full);
    padding: 0.35rem 0.5rem;
  }

  .bottom-nav-item {
    flex-direction: row;
    gap: 0.4rem;
    padding: 0.45rem 0.9rem;
  }
}
```

Also delete any `@media` rule that previously toggled `.app-sidebar`/`.bottom-nav` visibility (sidebar is gone).

- [ ] **Step 3: Verify**

Run: `npm run build && npm run lint`. Expected: exit 0. App will look broken visually until Tasks 4–5 land (views still render dashboard markup inside `view-layer`) — that's fine mid-branch.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx src/App.css
git commit -m "feat: map-first app shell (floating top bar, hub overlay, unified nav)"
```

---

### Task 4: PassengerView map-first

**Files:**
- Modify: `src/components/PassengerView.jsx`
- Modify: `src/App.css` (delete `.passenger-ride-split`, `.passenger-ride-mapcol`, `.passenger-ride-sidecol`, `.ride-builder-toolbar*`, `.map-hero`, `.ride-builder-shell` rules; keep `.map-center-pin*`, `.map-gradient-overlay`)

**Interfaces:**
- Consumes: `BottomSheet`, `OverlayPanel`, `Toast`, `EmptyState` from `./layout`; `useTheme` from `../hooks/useTheme`; `getMapTileUrl` from `../config`; new prop `onTabSync` from Task 3.
- Produces: none (leaf component). All existing handlers/subscriptions keep their names.

- [ ] **Step 1: Imports and new UI state**

In `PassengerView.jsx`:
- Replace `import { Section, EmptyState } from './layout';` with `import { BottomSheet, OverlayPanel, Toast, EmptyState } from './layout';`
- Replace `import { API_URL, MAP_TILE_URL, MAP_ATTRIBUTION } from '../config';` with `import { API_URL, MAP_ATTRIBUTION, getMapTileUrl } from '../config';`
- Add `import { useTheme } from '../hooks/useTheme';`
- Add prop `onTabSync` to the component signature.
- Add state/derivations after `hasActiveTrip`:

```js
  const [sheetSnap, setSheetSnap] = useState('peek');
  const theme = useTheme();
  const tileUrl = getMapTileUrl(theme);
  const phase = hasActiveTrip ? 'trip' : hasConcurrent ? 'waiting' : 'building';
```

- Add effects (after the existing fare-focus effect):

```js
  // Sheet position follows the flow: building stays low (map interaction),
  // fare entry and waiting/trip lift the sheet so content is visible.
  useEffect(() => {
    if (phase === 'building') setSheetSnap(isRouteSelected ? 'half' : 'peek');
    else setSheetSnap('half');
  }, [phase, isRouteSelected]);
```

- [ ] **Step 2: Replace the render**

Replace the entire `return (…)` with:

```jsx
  const stepIndex = !pickup ? 0 : !dropoff ? 1 : !fare ? 2 : 3;
  const stepLabel = ['Set pickup', 'Set destination', 'Enter fare', 'Confirm request'][stepIndex];

  const sheetHeader =
    phase === 'trip' ? (
      <div className="sheet-header-row">
        <div>
          <h2 className="sheet-title">Trip in progress</h2>
          <p className="sheet-subtitle">Pay as you go; the trip completes when fully paid.</p>
        </div>
        <button type="button" className="btn-ghost" onClick={refreshPassengerMyTrips} disabled={myTripsRefreshing}>
          {myTripsRefreshing ? '…' : 'Refresh'}
        </button>
      </div>
    ) : phase === 'waiting' ? (
      <div className="sheet-header-row">
        <div>
          <h2 className="sheet-title">Waiting for offers</h2>
          <p className="sheet-subtitle">Your request is live. Offers appear below.</p>
        </div>
        <button type="button" className="btn-ghost" onClick={refreshMyRide} disabled={myRideRefreshing}>
          {myRideRefreshing ? '…' : 'Refresh'}
        </button>
      </div>
    ) : (
      <div>
        <div className="sheet-header-row">
          <div>
            <h2 className="sheet-title">Where to?</h2>
            <p className="sheet-subtitle">Step {stepIndex + 1} of 4 — {stepLabel}</p>
          </div>
          {(!pickup || !dropoff) && (
            <button type="button" className="btn-primary" onClick={handleSetFromCenter}>
              {!pickup ? 'Set pickup' : 'Set drop-off'}
            </button>
          )}
        </div>
        <div className="sheet-step-pills" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={`sheet-step-pill ${i <= stepIndex ? 'sheet-step-pill--done' : ''}`} />
          ))}
        </div>
      </div>
    );

  return (
    <div className="mapfirst-view">
      <div className="mapfirst-map">
        {!userProfile.publicKey ? null : (
          <MapContainer
            center={currentLocation ? [currentLocation.lat, currentLocation.lng] : defaultMapCenter}
            zoom={12}
            zoomControl={false}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer key={tileUrl} url={tileUrl} attribution={MAP_ATTRIBUTION} />
            <MapCenterTracker onCenterChange={setMapCenter} />

            {previousRequests.map((r) => (
              !hasActiveTrip && (
                <React.Fragment key={r.txHash}>
                  <Marker position={[r.pickup.lat, r.pickup.lng]} icon={pickupIcon}><Popup>Pickup (awaiting offers)</Popup></Marker>
                  <Marker position={[r.dropoff.lat, r.dropoff.lng]} icon={dropoffIcon}><Popup>Dropoff (awaiting offers)</Popup></Marker>
                  <Polyline positions={[[r.pickup.lat, r.pickup.lng], [r.dropoff.lat, r.dropoff.lng]]} color="#94a3b8" weight={3} opacity={0.75} />
                </React.Fragment>
              )
            ))}

            {mapActiveTrips.map((t) => (
              <React.Fragment key={t.txHash}>
                <Marker position={[Number(t.pickupLocation.latitude), Number(t.pickupLocation.longitude)]} icon={pickupIcon}><Popup>Pickup (active trip)</Popup></Marker>
                <Marker position={[Number(t.dropoffLocation.latitude), Number(t.dropoffLocation.longitude)]} icon={dropoffIcon}><Popup>Dropoff (active trip)</Popup></Marker>
                <Polyline positions={[[Number(t.pickupLocation.latitude), Number(t.pickupLocation.longitude)], [Number(t.dropoffLocation.latitude), Number(t.dropoffLocation.longitude)]]} color="var(--accent)" weight={4} opacity={0.9} />
              </React.Fragment>
            ))}

            {hasActiveTrip && activeTripPickup && activeTripDropoff && (
              <MapFitBounds positions={[activeTripPickup, activeTripDropoff]} />
            )}
            {!hasActiveTrip && pickup && dropoff && (
              <MapFitBounds positions={[[pickup.lat, pickup.lng], [dropoff.lat, dropoff.lng]]} />
            )}
            {currentLocation && <MapFlyToLocation location={currentLocation} />}
            <LocationSelector
              pickup={pickup}
              dropoff={dropoff}
              setPickup={hasConcurrent || isRouteSelected ? () => {} : setPickup}
              setDropoff={hasConcurrent || isRouteSelected ? () => {} : setDropoff}
            />
            {currentLocation && <Marker position={currentLocation} icon={currentLocationIcon}><Popup>Your current location</Popup></Marker>}
            {!hasActiveTrip && pickup && <Marker position={pickup} icon={pickupIcon}><Popup>Pickup</Popup></Marker>}
            {!hasActiveTrip && dropoff && <Marker position={dropoff} icon={dropoffIcon}><Popup>Dropoff</Popup></Marker>}
            {!hasActiveTrip && pickup && dropoff && (
              <Polyline positions={[[pickup.lat, pickup.lng], [dropoff.lat, dropoff.lng]]} color="var(--accent)" weight={3} opacity={0.8} />
            )}
          </MapContainer>
        )}
        <MapLegend style={{ position: 'absolute', top: 'calc(4rem + env(safe-area-inset-top))', left: '0.75rem', zIndex: 900 }} />
        {phase === 'building' && !isRouteSelected && userProfile.publicKey && (
          <div className="map-center-pin" aria-hidden>
            <div className="map-center-pin-head">+</div>
            <div className="map-center-pin-stem" />
          </div>
        )}
      </div>

      <div className="map-fabs">
        <button type="button" className="map-fab" onClick={handleUseCurrentLocation} disabled={locating}>
          {locating ? 'Locating…' : '📍 My location'}
        </button>
        {phase === 'building' && (pickup || dropoff) && (
          <button type="button" className="map-fab" onClick={handleReset} disabled={isLoading}>
            ↺ Reset
          </button>
        )}
      </div>

      <Toast status={transactionStatus} onDismiss={() => setTransactionStatus(null)} />

      <BottomSheet snap={sheetSnap} onSnapChange={setSheetSnap} header={sheetHeader} ariaLabel="Passenger ride panel">
        {!userProfile.publicKey ? (
          <EmptyState message="Connect your wallet to request a ride." />
        ) : (
          <>
            {activeTripsError && <div className="status-banner error">{activeTripsError}</div>}
            {myRideRefreshError && <div className="status-banner error">{myRideRefreshError}</div>}
            {locationError && <div className="status-banner error">{locationError}</div>}

            {phase === 'building' && (
              <div className="ride-request-form-row" style={{ marginTop: '0.5rem' }}>
                <div className="ride-request-fare-col">
                  <label className="label">Fare (CLT)</label>
                  <input
                    ref={fareInputRef}
                    type="number"
                    value={fare}
                    onChange={(e) => setFare(e.target.value)}
                    className="input-field"
                    min={0}
                    placeholder="Enter fare after selecting route"
                    disabled={!pickup || !dropoff}
                  />
                </div>
                <div className="ride-request-actions">
                  <button
                    type="button"
                    className="btn-primary ride-request-btn"
                    disabled={!(pickup && dropoff && fare) || isLoading}
                    onClick={() => handleSubmit()}
                  >
                    {isLoading ? 'Submitting…' : 'Confirm request'}
                  </button>
                </div>
              </div>
            )}

            {phase === 'waiting' && (
              <div style={{ marginTop: '0.5rem' }}>
                {previousRequests.map((req, idx) => (
                  <RideRequestCard
                    key={req.txHash || idx}
                    req={req}
                    userProfile={userProfile}
                    hubSdk={hubSdk}
                    onAcceptSuccess={() => setRefreshBalanceCounter((prev) => prev + 1)}
                    onCancelSuccess={() => setRefreshBalanceCounter((prev) => prev + 1)}
                    requestPrivateKey={requestPrivateKey}
                  />
                ))}
              </div>
            )}

            {phase === 'trip' && (
              <div style={{ marginTop: '0.5rem' }}>
                {myTripsRefreshError && <div className="status-banner error">{myTripsRefreshError}</div>}
                {activeTrips.map((trip) => (
                  <ActiveTripCard
                    key={trip.txHash}
                    trip={trip}
                    passengerPayment={{ userProfile, onSuccess: () => setRefreshBalanceCounter((prev) => prev + 1) }}
                    cancelAction={{ userProfile, onSuccess: () => setRefreshBalanceCounter((prev) => prev + 1) }}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </BottomSheet>

      <OverlayPanel
        open={passengerTab === 'recent'}
        title="Recent rides"
        onClose={() => {
          setPassengerTab('rides');
          onTabSync?.('rides');
        }}
      >
        {!userProfile.publicKey ? (
          <EmptyState message="Connect your wallet to view recent rides." />
        ) : (
          <>
            {recentTripsError && <div className="status-banner error">{recentTripsError}</div>}
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 1rem 0' }}>
              Includes completed trips and cancelled rides. Active trips stay on the map.
            </p>
            {recentTrips.length > 0 ? (
              recentTrips.map((trip) => <CompletedTripCard key={trip.txHash} trip={trip} />)
            ) : !recentTripsLoading && !recentTripsError ? (
              <EmptyState message="No recent rides yet. When you finish paying or cancel a trip, it will appear here." />
            ) : null}
          </>
        )}
      </OverlayPanel>

      <PrivateKeyModal />
    </div>
  );
```

Notes:
- `RideRequestCard` (in this file) stays as-is — it already renders offers + accept/cancel; it just now lives inside the sheet.
- The `hasConcurrent`-blocked building form is gone entirely (waiting phase replaces it), so the old "Active request. Complete or cancel it first." banner and disabled form are no longer needed.
- `Section` import is dropped; the recent-trips subscription and all effects stay unchanged.
- Keep helper components (`LocationSelector`, `MapCenterTracker`, `MapFlyToLocation`) and all logic above the return untouched.

- [ ] **Step 3: Delete dead passenger CSS**

In `src/App.css` delete rule blocks for: `.passenger-ride-split`, `.passenger-ride-mapcol`, `.passenger-ride-sidecol`, `.map-hero`, `.ride-builder-shell`, `.ride-builder-toolbar`, `.ride-builder-toolbar-actions`, `.ride-builder-step-pill`, `.ride-builder-set-center-btn`, `.ride-builder-reset-btn`, `.ride-builder-location-btn`, `.map-wrapper--ride` (and their media-query variants). Keep `.map-center-pin*`, `.map-gradient-overlay`, `.map-wrapper` (still used by trip cards).

- [ ] **Step 4: Verify**

Run: `npm run build && npm run lint`. Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/PassengerView.jsx src/App.css
git commit -m "feat: passenger flow in full-screen map + bottom sheet"
```

---

### Task 5: DriverView map-first

**Files:**
- Modify: `src/components/DriverView.jsx`

**Interfaces:**
- Consumes: same primitives as Task 4; prop `onTabSync` from Task 3.
- Produces: none. `RideRequestCard` in this file is renamed/reshaped to `RequestDetail` (no mini-map, adds `onBack`); list rows are plain buttons.

- [ ] **Step 1: Imports and state**

- Replace `import { Section, EmptyState } from './layout';` with `import { BottomSheet, OverlayPanel, Toast, EmptyState } from './layout';`
- Replace config import with `import { API_URL, MAP_ATTRIBUTION, getMapTileUrl } from '../config';`
- Add `import { useTheme } from '../hooks/useTheme';`
- Add prop `onTabSync`.
- Add state after `hasActiveTrip`:

```js
  const [sheetSnap, setSheetSnap] = useState('half');
  const [selectedRequestTxHash, setSelectedRequestTxHash] = useState(null);
  const theme = useTheme();
  const tileUrl = getMapTileUrl(theme);
  const defaultMapCenter = [27.1883, 56.3772];

  const validRequests = rideRequests.filter((r) => (
    Number.isFinite(Number(r.pickupLocation?.latitude))
    && Number.isFinite(Number(r.pickupLocation?.longitude))
    && Number.isFinite(Number(r.dropoffLocation?.latitude))
    && Number.isFinite(Number(r.dropoffLocation?.longitude))
  ));
  const selectedRequest = validRequests.find((r) => r.txHash === selectedRequestTxHash) || null;

  // Clear a selection that disappeared (request fulfilled/cancelled).
  useEffect(() => {
    if (selectedRequestTxHash && !selectedRequest) setSelectedRequestTxHash(null);
  }, [selectedRequestTxHash, selectedRequest]);
```

- [ ] **Step 2: Reshape `RideRequestCard` → `RequestDetail`**

Same component body minus the `MapContainer`/`MapLegend` block and minus the invalid-coords banner (list already filters those), plus a back button. Full replacement of the `RideRequestCard` definition:

```jsx
const RequestDetail = ({
  req,
  userProfile,
  hubSdk,
  offerFares,
  handleFareChange,
  handleAcceptOffer,
  acceptingTxHash,
  disabled,
  onBack,
}) => {
  const [offers, setOffers] = useState([]);
  const [loadingOffers, setLoadingOffers] = useState(false);
  const [offersError, setOffersError] = useState(null);

  const fetchOffers = useCallback(async () => {
    if (!req.txHash) return;
    setLoadingOffers(true);
    setOffersError(null);
    try {
      const sdk = hubSdk ?? new ClutchHubSdk(API_URL, userProfile.publicKey || '0x0');
      const fetchedOffers = await sdk.listRideOffers(req.txHash);
      setOffers(fetchedOffers);
    } catch (err) {
      console.error('Failed to fetch offers:', err);
      setOffersError(err.message || 'Failed to load offers');
    } finally {
      setLoadingOffers(false);
    }
  }, [req.txHash, userProfile.publicKey, hubSdk]);

  useEffect(() => {
    if (!req.txHash) return undefined;
    setLoadingOffers(true);
    setOffersError(null);
    const sdk = hubSdk ?? new ClutchHubSdk(API_URL, userProfile.publicKey || '0x0');
    const dispose = subscribeRideOffersCompat(sdk, req.txHash, {
      onData: (list) => {
        setOffers(list);
        setLoadingOffers(false);
      },
      onError: (err) => {
        console.error('Offers subscription error:', err);
        setOffersError(err.message || 'Failed to load offers');
        setLoadingOffers(false);
      },
    });
    return () => dispose();
  }, [req.txHash, userProfile.publicKey, hubSdk]);

  return (
    <div>
      <button type="button" className="sheet-back-btn" onClick={onBack}>← All requests</button>
      <div className="form-row" style={{ justifyContent: 'space-between', margin: '0.5rem 0 0.875rem' }}>
        <span className="truncate-address" title={req.passengerAddress}>
          Passenger: {truncAddr(req.passengerAddress)}
        </span>
        <span className="fare-badge">{req.fare} CLT</span>
      </div>

      <div style={{ marginBottom: '0.875rem' }}>
        <div className="form-row" style={{ justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--on-surface-variant)' }}>Offers ({offers.length})</span>
          <button type="button" className="btn-ghost" onClick={fetchOffers} disabled={loadingOffers} style={{ fontSize: '0.75rem' }}>
            {loadingOffers ? '...' : 'Refresh'}
          </button>
        </div>
        {offersError && <div className="status-banner error" style={{ padding: '0.5rem', fontSize: '0.8rem', marginBottom: '0.5rem' }}>{offersError}</div>}
        {offers.length === 0 && !loadingOffers && !offersError && (
          <p style={{ fontSize: '0.8rem', color: 'var(--on-surface-variant)', margin: 0 }}>No offers yet.</p>
        )}
        {offers.map((offer) => (
          <div key={offer.txHash} className="offer-row offer-row--driver">
            <div className="offer-row-driver">
              <div className="offer-avatar" aria-hidden>🚗</div>
              <div className="offer-row-driver-meta">
                <p className="offer-row-driver-address">{truncAddr(offer.driverAddress)}</p>
                <p className="offer-row-driver-label">Driver</p>
              </div>
            </div>
            <div className="offer-row-price">{offer.fare} CLT</div>
          </div>
        ))}
      </div>

      <div>
        <div className="form-row">
          <label className="label" style={{ margin: 0, whiteSpace: 'nowrap' }}>Your offer</label>
          <input
            type="number"
            min={0}
            value={offerFares[req.txHash] !== undefined ? offerFares[req.txHash] : req.fare}
            onChange={(e) => handleFareChange(req.txHash, e.target.value)}
            className="input-field"
            style={{ width: 100, padding: '0.4rem 0.5rem', fontSize: '0.85rem' }}
            disabled={disabled || acceptingTxHash === req.txHash}
          />
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>CLT</span>
          <button
            type="button"
            className="btn-primary"
            style={{ marginLeft: 'auto', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
            disabled={disabled || !!acceptingTxHash || !userProfile.publicKey}
            onClick={() => handleAcceptOffer(req)}
          >
            {acceptingTxHash === req.txHash ? 'Submitting...' : disabled ? 'Finish trip first' : userProfile.publicKey ? 'Make Offer' : 'Connect wallet'}
          </button>
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 3: Replace the render**

Replace the entire `return (…)` of `DriverView` with:

```jsx
  const selPickup = selectedRequest
    ? [Number(selectedRequest.pickupLocation.latitude), Number(selectedRequest.pickupLocation.longitude)]
    : null;
  const selDropoff = selectedRequest
    ? [Number(selectedRequest.dropoffLocation.latitude), Number(selectedRequest.dropoffLocation.longitude)]
    : null;

  const tripWithRoute = activeTrips.find((t) => (
    Number.isFinite(Number(t?.pickupLocation?.latitude))
    && Number.isFinite(Number(t?.pickupLocation?.longitude))
    && Number.isFinite(Number(t?.dropoffLocation?.latitude))
    && Number.isFinite(Number(t?.dropoffLocation?.longitude))
  ));

  const sheetHeader = hasActiveTrip ? (
    <div className="sheet-header-row">
      <div>
        <h2 className="sheet-title">Trip in progress</h2>
        <p className="sheet-subtitle">Finish this trip before taking new requests.</p>
      </div>
      <button type="button" className="btn-ghost" onClick={refreshDriverMyTrips} disabled={myTripsRefreshing}>
        {myTripsRefreshing ? '…' : 'Refresh'}
      </button>
    </div>
  ) : (
    <div className="sheet-header-row">
      <div>
        <h2 className="sheet-title">{selectedRequest ? 'Ride request' : 'Available rides'}</h2>
        <p className="sheet-subtitle">
          {selectedRequest ? 'Route shown on the map.' : `${validRequests.length} open request${validRequests.length === 1 ? '' : 's'} · live updates`}
        </p>
      </div>
      <button type="button" className="btn-ghost" onClick={fetchRideRequests} disabled={isLoadingRides}>
        {isLoadingRides ? '…' : 'Refresh'}
      </button>
    </div>
  );

  return (
    <div className="mapfirst-view">
      <div className="mapfirst-map">
        <MapContainer center={defaultMapCenter} zoom={12} zoomControl={false} style={{ height: '100%', width: '100%' }}>
          <TileLayer key={tileUrl} url={tileUrl} attribution={MAP_ATTRIBUTION} />

          {!hasActiveTrip && validRequests.map((req) => (
            <Marker
              key={req.txHash}
              position={[Number(req.pickupLocation.latitude), Number(req.pickupLocation.longitude)]}
              icon={pickupIcon}
              eventHandlers={{ click: () => setSelectedRequestTxHash(req.txHash) }}
            >
              <Popup>Pickup · {req.fare} CLT</Popup>
            </Marker>
          ))}

          {!hasActiveTrip && selectedRequest && (
            <>
              <Marker position={selDropoff} icon={dropoffIcon}><Popup>Dropoff</Popup></Marker>
              <Polyline positions={[selPickup, selDropoff]} color="var(--accent)" weight={4} opacity={0.9} />
              <MapFitBounds positions={[selPickup, selDropoff]} />
            </>
          )}

          {!hasActiveTrip && !selectedRequest && validRequests.length > 0 && (
            <MapFitBounds positions={validRequests.map((r) => [Number(r.pickupLocation.latitude), Number(r.pickupLocation.longitude)])} />
          )}

          {tripWithRoute && (
            <>
              <Marker position={[Number(tripWithRoute.pickupLocation.latitude), Number(tripWithRoute.pickupLocation.longitude)]} icon={pickupIcon}><Popup>Pickup</Popup></Marker>
              <Marker position={[Number(tripWithRoute.dropoffLocation.latitude), Number(tripWithRoute.dropoffLocation.longitude)]} icon={dropoffIcon}><Popup>Dropoff</Popup></Marker>
              <Polyline
                positions={[
                  [Number(tripWithRoute.pickupLocation.latitude), Number(tripWithRoute.pickupLocation.longitude)],
                  [Number(tripWithRoute.dropoffLocation.latitude), Number(tripWithRoute.dropoffLocation.longitude)],
                ]}
                color="var(--accent)"
                weight={4}
                opacity={0.9}
              />
              <MapFitBounds
                positions={[
                  [Number(tripWithRoute.pickupLocation.latitude), Number(tripWithRoute.pickupLocation.longitude)],
                  [Number(tripWithRoute.dropoffLocation.latitude), Number(tripWithRoute.dropoffLocation.longitude)],
                ]}
              />
            </>
          )}
        </MapContainer>
        <MapLegend style={{ position: 'absolute', top: 'calc(4rem + env(safe-area-inset-top))', left: '0.75rem', zIndex: 900 }} />
      </div>

      <Toast status={acceptStatus} onDismiss={() => setAcceptStatus(null)} />

      <BottomSheet snap={sheetSnap} onSnapChange={setSheetSnap} header={sheetHeader} ariaLabel="Driver panel">
        {!userProfile.publicKey ? (
          <EmptyState message="Connect your wallet to see ride requests." />
        ) : hasActiveTrip ? (
          <>
            {activeTripsError && <div className="status-banner error">{activeTripsError}</div>}
            {myTripsRefreshError && <div className="status-banner error">{myTripsRefreshError}</div>}
            {activeTrips.map((trip) => (
              <ActiveTripCard
                key={trip.txHash}
                trip={trip}
                cancelAction={{ userProfile, onSuccess: () => setRefreshBalanceCounter((prev) => prev + 1) }}
              />
            ))}
          </>
        ) : selectedRequest ? (
          <RequestDetail
            req={selectedRequest}
            userProfile={userProfile}
            hubSdk={hubSdk}
            offerFares={offerFares}
            handleFareChange={handleFareChange}
            handleAcceptOffer={handleAcceptOffer}
            acceptingTxHash={acceptingTxHash}
            disabled={hasActiveTrip}
            onBack={() => setSelectedRequestTxHash(null)}
          />
        ) : (
          <>
            {ridesError && <div className="status-banner error">{ridesError}</div>}
            {activeTripsError && <div className="status-banner error">{activeTripsError}</div>}
            {validRequests.length === 0 && !isLoadingRides && (
              <EmptyState
                message={
                  ridesError
                    ? 'Could not load the list. Use refresh to try again, or wait for the live connection to recover.'
                    : 'No ride requests yet. When passengers request rides, they appear here and on the map.'
                }
                action="Refresh available rides"
                onAction={fetchRideRequests}
                actionDisabled={isLoadingRides}
              />
            )}
            {validRequests.map((req) => (
              <button
                key={req.txHash}
                type="button"
                className="request-row"
                onClick={() => setSelectedRequestTxHash(req.txHash)}
              >
                <div className="request-row-main">
                  <span className="request-row-address">{truncAddr(req.passengerAddress)}</span>
                  <span className="request-row-meta">Tap to view route & make an offer</span>
                </div>
                <span className="fare-badge">{req.fare} CLT</span>
              </button>
            ))}
          </>
        )}
      </BottomSheet>

      <OverlayPanel
        open={driverTab === 'recent'}
        title="Recent rides"
        onClose={() => {
          setDriverTab('rides');
          onTabSync?.('rides');
        }}
      >
        {!userProfile.publicKey ? (
          <EmptyState message="Connect your wallet to view recent rides." />
        ) : (
          <>
            {recentTripsError && <div className="status-banner error">{recentTripsError}</div>}
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 1rem 0' }}>
              Includes completed trips and cancelled rides. Active trips stay on the map.
            </p>
            {recentTrips.length > 0 ? (
              recentTrips.map((trip) => <CompletedTripCard key={trip.txHash} trip={trip} />)
            ) : !recentTripsLoading && !recentTripsError ? (
              <EmptyState message="No recent rides yet. When you finish paying or cancel a trip, it will appear here." />
            ) : null}
          </>
        )}
      </OverlayPanel>

      <PrivateKeyModal />
    </div>
  );
```

Notes:
- `acceptStatus` timeout-clearing logic in `handleAcceptOffer` is unchanged; the Toast just renders it.
- Unused after this change: `MapLegend` position moved; `Section` import must be removed; keep `MapFitBounds`, marker icon imports.
- `hasActiveTrip && userProfile.publicKey` info banner is replaced by the sheet header text.

- [ ] **Step 4: Verify**

Run: `npm run build && npm run lint`. Expected: exit 0. Lint will catch any now-unused imports (e.g. `Section`) — remove them.

- [ ] **Step 5: Commit**

```bash
git add src/components/DriverView.jsx
git commit -m "feat: driver flow on full-screen map with request list/detail sheet"
```

---

### Task 6: Theme-aware tiles in remaining map components

**Files:**
- Modify: `src/components/ActiveTripCard.jsx`
- Modify: `src/components/CompletedTripCard.jsx`
- Modify: `src/components/NetworkView.jsx`

**Interfaces:**
- Consumes: `useTheme`, `getMapTileUrl` from Task 1.

- [ ] **Step 1: Swap tile URL in each file**

In each of the three files:
- Change the config import: replace `MAP_TILE_URL` with `getMapTileUrl` (keep `MAP_ATTRIBUTION` and anything else imported).
- Add `import { useTheme } from '../hooks/useTheme';`
- Inside the component body add:

```js
  const theme = useTheme();
  const tileUrl = getMapTileUrl(theme);
```

- Replace `<TileLayer url={MAP_TILE_URL} attribution={MAP_ATTRIBUTION} />` with `<TileLayer key={tileUrl} url={tileUrl} attribution={MAP_ATTRIBUTION} />` (the `key` forces the layer to remount when the theme flips).

Note: in `CompletedTripCard.jsx`/`ActiveTripCard.jsx` the hook must be called in the top-level component, not inside `.map()` callbacks — if the TileLayer sits in a child function component defined in the file, add the hook to that child instead.

- [ ] **Step 2: Verify**

Run: `npm run build && npm run lint`. Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/ActiveTripCard.jsx src/components/CompletedTripCard.jsx src/components/NetworkView.jsx
git commit -m "feat: dark-theme map tiles across trip cards and network view"
```

---

### Task 7: Entry screen restyle

**Files:**
- Modify: `src/App.css` (`.app--entry`, `.role-entry*` rules)

**Interfaces:** none (CSS only; `RoleEntry.jsx` JSX unchanged).

- [ ] **Step 1: Restyle entry CSS**

Find the existing `.app--entry` / `.role-entry*` blocks in `App.css` and update to:

```css
.app--entry {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(1200px 600px at 80% -10%, rgba(39, 110, 241, 0.35), transparent 60%),
    radial-gradient(900px 500px at -10% 110%, rgba(254, 160, 251, 0.18), transparent 60%),
    var(--background);
}

.app-main--entry {
  width: 100%;
  max-width: 460px;
  padding: 1.5rem;
}

.role-entry {
  background: var(--glass-bg-strong);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--border);
  border-radius: var(--radius-2xl);
  box-shadow: var(--shadow-lg);
  padding: 2rem 1.75rem;
}

.role-entry-header {
  text-align: center;
  margin-bottom: 1.5rem;
}

.role-entry-logo {
  border-radius: var(--radius);
  margin-bottom: 0.75rem;
}

.role-entry-title {
  margin: 0 0 0.35rem;
  font-family: var(--font-headline);
  font-size: 1.5rem;
  font-weight: 800;
  letter-spacing: -0.03em;
}

.role-entry-subtitle {
  margin: 0;
  font-size: 0.9rem;
  color: var(--text-secondary);
}

.role-entry-buttons {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.role-entry-button {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.1rem 1.25rem;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  background: var(--surface-container);
  color: var(--text-primary);
  text-align: left;
  transition: all var(--transition);
}

.role-entry-button:hover {
  border-color: var(--primary-container);
  background: var(--surface-container-high);
  transform: translateY(-1px);
}

.role-entry-emoji {
  font-size: 1.75rem;
}

.role-entry-text {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.role-entry-label {
  font-family: var(--font-headline);
  font-size: 1.05rem;
  font-weight: 700;
}

.role-entry-hint {
  font-size: 0.8rem;
  color: var(--text-secondary);
}
```

If any of these rules don't exist yet, add them; if they exist, replace their bodies. Delete leftover duplicates.

- [ ] **Step 2: Verify**

Run: `npm run build && npm run lint`. Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/App.css
git commit -m "style: entry screen restyle (gradient backdrop, glass card)"
```

---

### Task 8: Cleanup

**Files:**
- Delete: `src/components/RoleSelector.jsx` (legacy, unimported)
- Delete: `src/components/RideForm.jsx` (defined, never imported)
- Modify: `src/App.css` (delete dead dashboard styles)

- [ ] **Step 1: Confirm the two components are unimported**

Run: `grep -rn "RoleSelector\|RideForm" src/ --include=*.jsx --include=*.js`
Expected: only their own definition files match. If anything else matches, stop and reassess.

- [ ] **Step 2: Delete files**

```bash
git rm src/components/RoleSelector.jsx src/components/RideForm.jsx
```

- [ ] **Step 3: Delete dead CSS**

In `src/App.css`, delete rule blocks (and their media-query variants) for selectors no longer present in any JSX: `.app-header`, `.app-header-right`, `.app-logo`, `.app-logo-text`, `.app-layout`, `.app-sidebar`, `.app-sidebar-profile-card`, `.hamburger-btn`, `.theme-toggle-btn`, `.app-menu-nav`, `.app-menu-nav-item`, `.app-menu-nav-title`, `.app-menu-nav-subtitle`, `.hub-tools-panel`, plus any `.role-selector*` and `.ride-form*` blocks. Before each deletion, grep the class name across `src/` to confirm it's unused:

Run: `grep -rn "app-sidebar\|hamburger-btn\|app-menu-nav\|hub-tools-panel\|role-selector\|ride-form" src/ --include=*.jsx`
Expected: no matches (after Tasks 3–5). `.app-logo-icon` stays (used in top bar).

- [ ] **Step 4: Verify**

Run: `npm run build && npm run lint`. Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove legacy dashboard styles and dead components"
```

---

## Final verification

1. `npm run build && npm run lint` — green.
2. User verifies visually in the docker compose stack (`clutch-deploy`, dev overlay) on mobile viewport and desktop:
   - Entry → role pick → wallet → map fills screen, sheet at peek.
   - Passenger: set pickup/dropoff (tap + center-pin), fare, confirm → waiting sheet → offers appear → accept → trip in sheet → pay → completes → Recent overlay shows it.
   - Driver: markers on map, tap marker/list row → route + detail → make offer → trip.
   - Hub overlay (About/Tx/Network), theme toggle flips map tiles, drawer sign-out.
