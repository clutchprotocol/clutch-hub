# clutch-hub-sdk-js

TypeScript client SDK for Clutch Protocol (npm: `clutch-hub-sdk-js`). Signs transactions
client-side (secp256k1 + keccak-256 + RLP) and talks to the Hub API over GraphQL HTTP and
graphql-ws subscriptions.

This package sits at `packages/sdk` in the `clutch-hub` workspace, beside the reference app at
`apps/demo`. The repo root's `CLAUDE.md` covers the workspace and the release wiring; the parent
`D:\source\clutch\CLAUDE.md` covers the whole Clutch project.

## Source Layout

Only five source files — the SDK is deliberately small:

- `src/sdk.ts` — everything important: `ClutchHubSdk` class, JWT auth caching, signing/hashing,
  RLP encoding (`encodeFunctionCall`), all GraphQL queries/mutations/subscriptions inline as
  template strings. Also exports `stripHexPrefix`, `normalizeTxHashForRlp`,
  `UnsignedTransaction`, `createLocalSigner`, `addressFromPrivateKey`.
- `src/signers.ts` — the `Signer` interface and the wallet side of it (added 2026-10-06):
  `createWalletSigner` (EIP-1193 `personal_sign`), `createTronLinkSigner` (TronLink `signMessageV2`),
  `discoverInjectedWallets` (EIP-6963 and TIP-6963, then `window.ethereum` / `window.tron`),
  `connectWallet`, `createSignerFor`, `sharedWalletAccount`, `watchWalletAccounts`,
  `walletTransactionText`, `personalSignDigest`, `tronSignDigest`, `tronAddressToHex`. It must not
  import `sdk.ts` (`sdk.ts` imports it); that is why `stripHexPrefix` has a private copy there.
- `src/subscriptions.ts` — `hubGraphqlWsUrl()` (HTTP base URL → `ws(s)://…/graphql/ws`),
  `createHubSubscriptionClient()` (graphql-ws client: `lazy: false`, infinite retry, 10s keepAlive),
  shared GraphQL field-selection constants (`RIDE_REQUEST_GQL_FIELDS` etc.), `SubscriptionHandlers<T>`.
- `src/types.ts` — arg/result interfaces (`RideRequestArgs`, `AvailableActiveTrip`, `MapBounds`,
  `Signature`, …).
- `src/index.ts` — barrel re-exports. New public symbols must be reachable from here.

Tests live in `test/*.test.mjs` and use Node's built-in runner (`npm test`),
no framework. They import from `dist/`, so `npm run build` first; the release workflow runs them
after the build and before semantic-release. The script is `node --test test/*.test.mjs`: a bare
directory stopped working in Node 22.

## Signers and wallets (since 2026-10-06)

Wherever the SDK took a private key string (constructor, `setPrivateKey`, `signTransaction`) it
takes a `string | Signer`. A `Signer` is `{ address, signTransaction({hashHex, chainId}),
signAuthChallenge({message, hashHex}) }`; the SDK keeps one per account in a module-global map
(`globalSigners`, keyed by `publicKey`, like the JWT cache).

- **Key** (`createLocalSigner`): signs the hash string, exactly as before.
- **Wallet** (`createWalletSigner(provider, address)`): MetaMask and Trust Wallet will not sign a
  bare hash, so the wallet signs a readable text with `personal_sign` (EIP-191):
  `clutch-tx:{chainId}:{hash}` for a transaction (hash = 64 lowercase hex, no `0x`) and the plain
  `clutch-auth:{chainId}:{publicKey}:{timestamp}` for the login. The node
  (`Transaction::verify_signature`) and the Hub API (`verify_auth_challenge`) accept this next to
  the key signature. The texts are a contract with those two: change them together or not at all.
- Wallet quirks handled in `signers.ts`: the message goes to the wallet as `0x`+hex of the UTF-8
  text (a text that starts with `0x` is read as bytes); the answer is 65 bytes `r||s||v` and `v`
  is lifted from 0/1 to 27/28; the account is lowercased (the hash commits to `from`, and the node
  reads it in lower case); the signature is recovered locally and refused if it is from another
  account than the one asked (the user switched accounts).
- **TronLink** (`createTronLinkSigner(provider, address)`, added 2026-10-06): TronLink signs with
  `tronWeb.trx.signMessageV2` (TIP-191), which hashes `"\x19TRON Signed Message:\n" + length + text`
  (TronWeb's `message.js`). The key, the curve, Keccak-256 and the 20 address bytes are the same as
  an Ethereum key, so the Clutch address of a TronLink account is its base58 `T…` address decoded
  (`tronAddressToHex`, checksum checked): `0x41` + 20 bytes + 4 bytes of checksum. The texts are the
  same two as for `personal_sign`. Quirks, all from TronLink's documentation, which is not clear in
  one place: discovery is TIP-6963 (`TIP6963:announceProvider`, `rdns org.tronlink.www`) or
  `window.tron` (older `window.tronLink`); connect is `eth_requestAccounts` (TronLink's documented
  authorization, at developers.tron.network/docs/tronlink-integration): the person approves the site,
  the answer is a `0x` account that the SDK does not read, and the TRON address is then
  `provider.tronWeb.defaultAddress.base58`. `tron_requestAccounts` is the legacy method, and the TRON
  provider answers it 4200 (the app-stage error "TronLink is too old", 2026-10-08; PR #35 had
  wrongly used it). `provider.tronWeb` is `false` until the site is allowed, so `sharedWalletAccount`
  reads it for the no-prompt reconnect;
  `signMessageV2` rejects with `Error("user rejected request")` and no code. **What `signMessageV2`
  takes is unclear**: one page says a hex string, another says plain text or hex. The SDK sends the
  text plain first; a TronLink that answers "Invalid transaction provided" before a prompt gets the
  `0x` hex of the UTF-8 text; any other error ends the call (a second try would open a second
  prompt). The signature is recovered here with the TRON digest and refused if it is not the
  account's; a TronLink that signed the hex as text is named in the error (`signed the hex text`).
  This has not been tried against a real TronLink: the tests use a fake written from its docs.
- `test/signers.test.mjs` uses fake wallets written from the standards (not from the SDK), and pins
  signatures that the Rust tests of the node and the Hub API pin too: two made by `@noble/secp256k1`
  (`personal_sign`) and two made by TronWeb 6.5.1 itself (`signMessageV2`).

## Transaction Lifecycle (client side)

1. **Build unsigned**: `createUnsignedRideRequest/Offer/Acceptance/Pay/Cancel/RequestCancel` call
   the corresponding Hub API mutation (after `ensureAuth`) and get back
   `{ data, from, nonce }` (`UnsignedTransaction`).
2. **Encode call data**: `encodeFunctionCall(data)` maps the function-call type to a nested array
   `[tag, args]` for RLP. Tags must match the Rust node: RideRequest=1, RideOffer=2,
   RideAcceptance=3, RidePay=4, RideCancel=5, RideRequestCancel=8 (6/7 reserved elsewhere).
3. **Hash**: RLP-encode `[from (no 0x), nonce, callDataArray]`, keccak-256 it → `rawHashHex`.
4. **Sign**: `signHash` does **not** sign the hash bytes directly — the Rust node verifies
   `Keccak256(hash_string.as_utf8_bytes())`, so the SDK keccaks the *hex string's UTF-8 bytes*,
   then `secp.signAsync`. Recovery id + 27 → `v`.
5. **Encode signed**: RLP `[from, nonce, r, s, v, hash, callDataArray]` (all hex without 0x) →
   `rawTransaction: '0x…'`.
6. **Submit**: `submitTransaction(rawTransaction)` → `sendRawTransaction` mutation → tx hash.

Signing quirks to preserve: floats (lat/lng) are encoded as IEEE-754 big-endian u64 bits via
`float64ToUint64` (BigInt); tx-hash args go through `normalizeTxHashForRlp` (strips 0x *and*
legacy JSON-string quoting); empty referrer encodes as `''`.

## Public API Surface (`ClutchHubSdk`)

- **Constructor / identity**: `new ClutchHubSdk(apiUrl, publicKey, privateKey?, chainId?, options?)`
  where `options.timeoutMs` bounds every hub HTTP request (default `DEFAULT_HTTP_TIMEOUT_MS`,
  30 s; `0` disables). Hash arguments to `listRideOffers`/`subscribeRideOffers` go through
  `normalizeTxHashForQuery` (strip `0x`, lowercase) because the hub matches them as exact
  strings. `getPublicKey()`,
  `setPrivateKey(privateKey)`, `isAuthenticated()`. The private key (constructor arg or
  `setPrivateKey`) is required for token issuance — `generateToken` demands a signed
  proof-of-key-ownership challenge. It is kept in a module-global map keyed by publicKey
  (like the JWT cache) and never sent to the API.
- **Auth (internal)**: `ensureAuth()` builds the challenge `clutch-auth:{publicKey}:{timestamp}`
  (unix seconds), signs it via `signAuthChallenge` (Keccak-256 the message to a hex string, then
  the usual `signHashHex` convention — see Transaction Lifecycle step 4), and calls the
  `generateToken(publicKey, timestamp, signature)` mutation. The Hub API rejects timestamps more
  than ±120s from server time. JWTs are cached in a **module-global** map keyed by publicKey with
  30s expiry buffer and in-flight dedup, so multiple SDK instances share tokens; `ensureAuth`
  throws if no cached token is valid and no private key was provided. Exported helpers:
  `buildAuthChallengeMessage`, `authChallengeHashHex`, `signAuthChallenge` — these must stay
  byte-for-byte in sync with `clutch-hub-api`'s `hub/auth.rs`.
- **Unsigned tx builders**: `createUnsignedRideRequest/RideOffer/RideAcceptance/RidePay/RideCancel/RideRequestCancel`.
- **Sign & submit**: `signTransaction(unsignedTx, privateKey)` → `{ r, s, v, rawTransaction, txHash }`;
  `submitTransaction(rawTransaction)`.
- **Queries**: `listRideRequests(bounds?)`, `listRideOffers(hash)`, `listActiveTrips`,
  `listCompletedTrips`, `listRecentTrips`, `getAccountBalance(publicKey?)`.
- **Subscriptions** (each returns a dispose function): `subscribeRideRequests`,
  `subscribeRideOffers`, `subscribeActiveTrips`, `subscribeCompletedTrips`, `subscribeRecentTrips`,
  `subscribeAccountBalance`. All multiplex over **one shared graphql-ws socket per
  (hub URL, publicKey)**, refcounted in a module-global map; the last dispose closes the socket.
  Always call the returned dispose function or sockets/refcounts leak.
- **Misc**: `getGraphqlWsUrl()`.

## Adding a New Transaction Type

1. Add the arg interface to `src/types.ts`; export lands via `src/index.ts` automatically.
2. Add `createUnsignedXxx` in `src/sdk.ts` mirroring existing ones (inline mutation string,
   `ensureAuth`, `executeGraphQL`).
3. Add a `case` in `encodeFunctionCall` with the **same tag number and argument order as the Rust
   node's FunctionCall enum** (`clutch-node`) — a mismatch produces valid-looking txs the node
   rejects. Support both snake_case (`ride_offer_transaction_hash`) and camelCase arg keys, as the
   Hub API has returned both shapes.
4. Upstream first: node RPC → `clutch-hub-api` GraphQL mutation must exist before the SDK method
   works. Then update `clutch-hub-demo-app` and `clutch-docs`.

For a new query/subscription: add types + field constant (in `subscriptions.ts` if shared between
query and subscription), then a `listXxx` using `executeGraphQL` and/or a `subscribeXxx` using
`subscribeGraphqlListField` (list payloads) or the manual pattern in `subscribeAccountBalance`
(scalar payloads).

## Build & Release

- `npm run build` = `tsc` → `dist/` (declarations included). `prepare` also builds, so a plain
  `npm install` at the workspace root leaves `dist/` in place. No lint script exists despite
  CONTRIBUTING.md mentioning one.
- tsconfig: ES2020 target, `module: ESNext`, `strict: true`, DOM lib included (browser-first).
- **semantic-release** on push to `main` (`.github/workflows/npm-publish.yml` + `.releaserc.json`):
  Conventional Commits required. `feat:` → minor, `fix:`/`perf:`/`refactor:`/`build:` → patch,
  `feat!:` or a `BREAKING CHANGE:` footer → major; `docs:`/`chore:`/`ci:`/`test:`/`style:`
  release nothing. (`build:` has been a patch since e974923, 2026-09-18.) Only commits that touch
  `packages/sdk` count at all. A push to `main` that does not release publishes a
  `-canary.<sha>` build under the `canary` dist-tag; one that releases does not. A `beta` branch does prereleases. CHANGELOG.md and package.json version are
  bot-committed (`chore(release): x.y.z [skip ci]`) — never bump the version by hand.
- **It runs from the repo root, not from here**, with `pkgRoot: packages/sdk`. That keeps
  `tagFormat` at `v${version}`, which is what the existing `v1`..`v4` tags use. See the root
  `CLAUDE.md` — getting this wrong restarts versioning at 1.0.0.
- **Only commits that touch `packages/sdk` count toward its version and release notes.**
  `release/sdk-commits.mjs` filters them for semantic-release, which otherwise counts every commit
  in the repo. The `paths:` filter in `npm-publish.yml` only decides when the job runs.
- The demo app consumes this package as a **workspace** (`"clutch-hub-sdk-js": "*"`), and
  `apps/demo/vite.config.js` aliases the import to `../../packages/sdk`. So SDK source changes
  reach the demo app on its next `npm run dev` — but if Vite is already running you may need to
  restart / clear `node_modules/.vite` to pick up the rebuilt dist.

## Gotchas

- **Browser + Node dual use**: `sdk.ts` imports `buffer` (npm polyfill) and assigns
  `window.Buffer` if missing. Don't use Node-only APIs; keep DOM usage guarded by
  `typeof window !== 'undefined'`.
- `@noble/secp256k1` v2 hex parsers reject `0x` prefixes — always run keys/hashes through
  `stripHexPrefix` before passing them to noble.
- Auth state (JWT cache, in-flight dedup, shared WS clients) is module-global, not per-instance —
  tests or multi-wallet apps share it by design.
- WS subscriptions silently continue without a JWT if `generateToken` fails — including when no
  private key was supplied for the wallet (public list subscriptions are allowed unauthenticated).
- GraphQL operations are inline strings with hand-written TS result types — there is no codegen;
  keep field constants and `types.ts` in sync with the Hub API schema manually.
