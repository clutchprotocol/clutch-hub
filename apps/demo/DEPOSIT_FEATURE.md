# Top up with USDT — deposit feature

Client + plumbing for paying testnet USDT and receiving CLT. Backend (`payment-orchestrator`) was already complete; this covers the UI and the wiring needed to reach it from a browser.

## Component and mount point

`src/components/DepositPanel.jsx` — one form + result view. States: amount input → `POST /api/v1/deposits` → pay-address/exact-amount display with a 5s poll of `GET /api/v1/deposits/:id` → status chip through to `credited`/`expired`/`failed`/`needs_manual`.

Mounted in `src/App.jsx` as an `OverlayPanel` (`open={depositOpen}`), the same always-mounted/`hidden`-toggled pattern already used for the "About & network" overlay. Opened via a new "Top up with USDT" button placed in the hamburger menu, next to the existing `BalanceDisplay`/faucet row — this is where "money in" already lives in the app, so the deposit flow joins it rather than getting a new nav location. On `credited`, it bumps the same `walletRefresh` counter the faucet uses, so the balance display refreshes the normal way.

Deposits never sign an on-chain transaction (unlike the withdraw/Burn flow, which is out of scope here) — CLT arrives via the treasury's own mint bridge. The only reason a private key is needed at all is that `sdk.getAuthHeaders()` calls `generateToken` internally, which requires a signed proof-of-key-ownership challenge; this hits the same "private key before the first authenticated call" trap CLAUDE.md documents for `createUnsigned*`, so the same `usePrivateKeyRequest()` modal pattern is reused.

## Exact-amount handling (the point of the task)

`pay_amount_usdt` is displayed via a new `formatExactUsdt()` in `src/utils/money.js` — deliberately separate from the existing `formatUsd()`, which floors to cents and comma-groups for display convenience and would silently destroy the discriminator. `formatExactUsdt` does the padded integer-division the task specifies (`n / 1_000_000n` + `(n % 1_000_000n).padStart(6,'0')`) and accepts bigint/number/string defensively, same posture as `formatUsd` already takes for the hub's number-vs-decimal-string inconsistency.

Verified against the running stack, not just read: created deposits for $5, $3, $7, and $12.50 through the actual UI. Example — typed `12.5`, server returned `pay_amount_usdt: 12500098` (bare JSON number, confirmed against `payment-orchestrator`'s own request/response code and its test fixtures), UI displayed `12.500098`. Confirmed via `read_network_requests` that the wire value and the rendered text match exactly, and via direct DOM query that the copy-to-clipboard span's content is the bare number (no "USDT" suffix baked into what gets copied).

One real gap found and fixed during this work: `GET /api/v1/deposits/:id` does not return `pay_address` (it's not stored on the row — the create response is the only place it's echoed back). The initial draft replaced the whole `deposit` state object on every poll tick, which would have made the pay address vanish the instant the first poll landed. Fixed by merging (`{...prev, ...body}`) instead of replacing.

The request body sends `amount_usdt` as a bare JSON number (`Number(amountClt)`), not a string — confirmed against the orchestrator's own Rust test fixtures, which all send `{"amount_usdt":2000000}` un-quoted. Safe here specifically because deposits are bounds-checked server-side to $1–$50, nowhere near 2^53.

## URL resolution (`src/config.js`)

Added `ORCHESTRATOR_BASE_URL`, following the same env-var-then-default shape `API_URL` uses, but simpler: the orchestrator has no split stage subdomain like the hub API's `api-stage.*`. clutch-deploy's nginx proxies it same-origin at `/payment/`, so the deployed default is the relative path `/payment` — no hostname sniffing needed. `VITE_ORCHESTRATOR_URL` overrides it for local dev, where the Vite origin (`:5173`) and the orchestrator's published port (`:8091`) really are cross-origin. Wired into `clutch-deploy/docker-compose.dev.yml` as `VITE_ORCHESTRATOR_URL: http://127.0.0.1:8091` (mirrors the existing `VITE_API_URL: http://127.0.0.1:3000` convention — browser's-eye view, not container DNS).

## CORS (`clutch-treasury`)

`payment-orchestrator` had zero CORS handling (no browser route existed before this). Added, mirroring `clutch-hub-api`'s config style exactly (`allowed_origins: String`, `"*"` or comma-separated list, same doc comment) but built on `tower_http::cors::CorsLayer` rather than `actix-cors::Cors`, since the orchestrator is Axum, hub-api is Actix. Non-wildcard branch explicitly allows `authorization`, `content-type`, `idempotency-key` — a header allowlist can't use a wildcard, so these are named. `tower-http` was already resolved to `0.6.11` transitively (via `reqwest`); adding it as a direct dependency at `"0.6"` picked up the same pinned version — confirmed via the `Cargo.lock` diff (one line added to `payment-orchestrator`'s dependency list, no version bump anywhere).

`docker-compose.treasury.yml` reuses the existing `ALLOWED_ORIGINS` env var (same list the hub API CORS-allows) rather than inventing an orchestrator-specific one — both services are called from the same demo-app origin, and it already includes `localhost:5173`.

Verified with real preflight requests against the rebuilt container: an allowed origin gets `access-control-allow-origin` + the three named headers back; a disallowed origin gets no CORS headers (browser would block it). Also verified end-to-end from the actual browser — the `OPTIONS` preflights for both the create and poll requests succeed in the network log.

## nginx (`clutch-deploy`)

Added a `payment-orchestrator` upstream and a `/payment/` location (rewriting to strip the prefix before proxying, same pattern as the existing `/explorer/api/` route) to both `config/nginx/nginx.conf` (local optional reverse proxy) and `config/nginx/nginx.stage.cloudflare-flex.conf` (inside the `app-stage.*` server block, alongside the hub's `/api/`). This is required, not optional, per the task: the orchestrator is deliberately unpublished on stage (`docker-compose.stage.treasury.yml` resets its ports), so nginx is the only path in.

## Testing

Rust: full workspace suite via the docker rig (`docker compose -f docker-compose.test.yml run --rm test`), foreground, twice (once mid-development, once after reverting a temporary debug log added during investigation below) — 20/20 test binaries `ok`, 0 failed both times. `tower-http v0.6.11` compiles as part of the normal build, no lockfile surprises.

Five existing test files (`db_bridge.rs`, `db_deposits.rs`, `db_deposit_api.rs`, `db_redemptions.rs`, `db_webhook.rs`) each build an `OrchConfig` struct literal directly; all five needed `allowed_origins: "*".into()` added since the new field has no `Default` derive (only a serde default, which doesn't cover struct-literal construction). Mechanical, one line each.

UI: verified live against the running `clutch-dev` stack (not just assumed) — rebuilt only `payment-orchestrator` (`--build --no-deps`), recreated the demo-app container once (`--no-deps --force-recreate`, no `--build`, per this repo's own gotcha) to pick up `VITE_ORCHESTRATOR_URL`, then drove the actual app in a browser: opened the menu, clicked "Top up with USDT," submitted several amounts, and cross-checked the raw network response against the rendered text and the copy-to-clipboard content.

One investigation worth recording: the browser tool's network-request log showed paired duplicate `GET /api/v1/deposits/:id` calls per poll tick, which looked like a real bug (interval running twice). Chased it down with `setInterval`/`fetch` monkey-patching (confirmed exactly one `setInterval` call and correctly-spaced single fetches when tested cleanly) and, to settle it conclusively, a temporary `tracing::info!` counter added directly to `get_deposit_handler`, rebuilt, and checked against real server logs — which showed exactly one invocation every 5.000 seconds, no duplicates, ever. The apparent duplication was an artifact of the browser tool's network panel (likely related to the app's always-on PWA service worker, which re-registers itself on every load) interacting with the disruptive container recreation earlier in the same session, not a defect in the polling code. The debug line was reverted and the full test suite re-run clean afterward.

## Decisions made along the way

- **No SDK changes.** The task only asked for URL-resolution parity with `config.js`, not a wrapper client; `sdk.getAuthHeaders()` already existed in `clutch-hub-sdk-js` (built into the current `dist/`) for exactly this purpose ("ready to attach to a hand-rolled request... an orchestrator REST client that reuses this SDK's auth"), so the component calls the orchestrator with plain `fetch()` plus that header, rather than adding an orchestrator client to the SDK.
- **`/payment/` as the nginx path prefix** — no existing convention named one; chosen to match the actual service name (`payment-orchestrator`) and avoid any confusion with the private `treasury-service`, which should never be URL-facing.
- **No cancel/reset affordance while a deposit is non-terminal.** You can't start a second deposit from the same panel until the first reaches a terminal status (`credited`/`expired`/`failed`/`needs_manual`) — matches the single-active-item pattern already used elsewhere in the app (e.g. `hasConcurrent` gating the ride builder) rather than adding new multi-deposit bookkeeping the task didn't ask for.
- **Closing the overlay does not stop polling.** `DepositPanel` stays mounted (same as every other overlay panel in this app) and keeps polling in the background if the user closes the panel before the deposit resolves — consistent with how live subscriptions elsewhere in the app behave, and cheap (one GET every 5s, stops itself at a terminal status).
