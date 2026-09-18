## [4.2.0](https://github.com/clutchprotocol/clutch-hub-sdk-js/compare/v4.1.0...v4.2.0) (2026-09-18)


### ⚠ BREAKING CHANGES

* adopt SDK v3 — bigint money, dollar display, pre-sign verification

### Features

* adopt SDK v3 — bigint money, dollar display, pre-sign verification ([2dedaf3](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/2dedaf30fa95ce398a3a861eb8d6b17d81d16a8e))
* BottomSheet, OverlayPanel, Toast primitives for map-first shell ([d867846](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/d867846916482dba092d2d914df8e1db6f9ed47d))
* dark-theme map tiles across trip cards and network view ([bfd49de](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/bfd49deaf4dfd0b232280a7cdb666c5f409c965e))
* driver flow on full-screen map with request list/detail sheet ([a6fdec4](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/a6fdec4f76b23c529013a89d538d5108c6bbf31a))
* encrypted wallet backup and restore ([f0be0a5](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/f0be0a5211756772bffe9d75d58c0f8141c61839))
* make this an npm workspace holding the SDK and the demo app ([e974923](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/e97492368eade0dd65640ac2c2d6b1fc758e482a))
* map-first app shell (floating top bar, hub overlay, unified nav) ([aa9049d](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/aa9049d5ac159712fb4f771b5673b632902c2276))
* pass private key to SDK for auth challenge ([32e1ab1](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/32e1ab1aac0faa32d665b64259f9f6b45ea5a4d7))
* passenger flow in full-screen map + bottom sheet ([e95a134](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/e95a134364588ff7b734b5194a8164bdfa461ad6))
* redeem CLT for USDT from the app ([2a53ba4](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/2a53ba46b773a28f671d7a3deb5fae7d26d13320))
* say what this app does with a private key, before one exists ([974461f](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/974461ff73242b50ac1b02e7abacd78ec23dd450))
* show a permanent deposit address instead of asking for an amount ([86cf02a](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/86cf02a64831a6c8cfea92a8d760b0e0d854a036))
* show recent deposits and their state in the top-up panel ([8dd0c19](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/8dd0c19a5f6daf08e54c8a3a8033ce0a90aa9390))
* stack the menu actions, and drop dark mode ([7cb39bf](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/7cb39bf44b96426b9ddcb5ef822041817f6cacb5))
* tell testnet users where to get USDT to deposit ([811f258](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/811f2581d8823cb2504773a12ffe01f1114abe95))
* tell the passenger what accepting an offer costs them ([e17c3ce](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/e17c3ce6f4627b55034c353bceaf3699cf8da27d))
* theme-aware map tile plumbing (useTheme, getMapTileUrl) ([d28d44e](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/d28d44e9e96a850a634ebe515be4d1af20fb5dee))
* top up with USDT — deposit panel wired to the payment orchestrator ([5c86648](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/5c8664812fab3ad3c06f29ec7a56909bb97fd4a4))


### Bug Fixes

* delete the production build path, which never worked ([cec9151](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/cec9151414529fce42cbbaf6c7b3199675bc28b6))
* **deposits:** show when the transfer landed, not when the row appeared ([22c5595](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/22c55955fd5dd165e26007330a16e6c6d703a770)), closes [clutchprotocol/clutch-treasury#9](https://github.com/clutchprotocol/clutch-treasury/issues/9)
* fetch the deposit address only while the panel is open ([9087dde](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/9087ddebd416260fc9548c481bcefe13c3303b62))
* formatUsd must accept the decimal strings the hub actually sends ([4fdf22d](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/4fdf22dbfff891ab4fa35579ee46c35ae3e6c5e5))
* let the app update itself, and let the user choose when ([837fd7b](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/837fd7b74075c35d9cdd0a4ec082d328af17a67c))
* map tiles no longer need a CARTO API key ([7902ee4](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/7902ee45ac0fbcc311ecc7a91e00c50a093b47a4))
* show the withdrawal fee before the burn, not after ([567529f](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/567529fa5249cdf68f6e06065a1dffb2dfb16985))
* start the deposit panel in its loading state; log a failed re-fetch ([72734ee](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/72734ee5695340f8650e66a344db9d60bb5ed6c9))
* stop serving a stale build, and show the deposit address in full ([4fe1222](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/4fe1222166cabd3ddd028aa772c9694003eb8914))
* stop serving a stale build, and show the deposit address in full ([39dc917](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/39dc917eaad8165368b5d55432cfb19ce1c0a9f6))
* the deposit amount is a minimum now, not an exact figure ([610750d](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/610750da757a0211a262d07677b02c8bd85dd0ca))
* the deposit-list poller must not outlive the panel ([d1a9ff9](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/d1a9ff94ef0db42438eb7b9522f013a811c9e1ac))
* verify the burn before signing it, and re-read before broadcasting ([2df94c6](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/2df94c6101fac2abc79e1792a3b157a3deae2e1e))

## [4.1.0](https://github.com/clutchprotocol/clutch-hub-sdk-js/compare/v4.0.0...v4.1.0) (2026-09-10)


### Features

* bound every hub HTTP request with a timeout ([bdd1b3d](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/bdd1b3dae5f9335c7acd6b0cc2c9bfa3df836809))


### Bug Fixes

* normalize hash arguments before querying the hub for offers ([1cd0dfd](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/1cd0dfd63616b3ee7554770ec644cce1c6a711fb))

## [4.0.0](https://github.com/clutchprotocol/clutch-hub-sdk-js/compare/v3.0.0...v4.0.0) (2026-09-04)


### ⚠ BREAKING CHANGES

* `requestFaucet` is removed from `ClutchHubSdk` and the
`FaucetResponse` type is no longer exported. There is no replacement — the
server endpoint is gone; CLT is obtained by depositing USDT.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>

### Features

* remove requestFaucet ([a8186f5](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/a8186f555588f781a8c7a1e905e724b343ae2948))


### Reverts

* the 4.0.0 release commit that npm rejected ([ba16f76](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/ba16f76e6e49b9153dcd0c5e954e926c9f0f0dee))
* the 4.0.0 release commit, which npm rejected ([fd456d9](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/fd456d98c2f70a3f8d86da82eaaa84289919a0d6))
* the orphaned 4.0.0 release commit ([9d49388](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/9d49388b45c67ef030dd2d78775b815228c9253e))

## [3.0.0](https://github.com/clutchprotocol/clutch-hub-sdk-js/compare/v2.0.1...v3.0.0) (2026-07-30)


### ⚠ BREAKING CHANGES

* verifying an unsigned transaction now requires a chainId
pinned via the ClutchHubSdk constructor or expected.chainId.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
* signTransaction's hash preimage and signed payload
both gained chain_id (inserted after nonce; everything after it shifts
by one index). fare/amount/balance public types moved from number to
bigint; the corresponding GraphQL mutation variables changed from
Int to String. buildAuthChallengeMessage/authChallengeHashHex/
signAuthChallenge gained a required leading chainId parameter and the
auth challenge string format changed — no fallback to the old
two-field format. Requires clutch-node treasury-break and a hub-api
build with chainInfo/createUnsignedBurn. The orchestrator REST client
described in the task brief was deliberately not built: it targets a
payment-orchestrator service that does not exist yet.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>

### Features

* v3 wire format — chain_id in signing, bigint amounts, tx verification, Burn ([b677894](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/b677894d92cd39a9444bec93b09226d775145dfd))


### Bug Fixes

* fail closed when verifying an unsigned tx with no pinned chainId ([353a5f2](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/353a5f278bb2192cdfa4dbed9c4d850cd1a06042))

## [2.0.1](https://github.com/clutchprotocol/clutch-hub-sdk-js/compare/v2.0.0...v2.0.1) (2026-07-24)


### Bug Fixes

* **deps:** bump axios to ^1.18.1, patch bn.js — clears all runtime advisories ([b6a3828](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/b6a3828915979cbf02ee06b1d7721329281349f6))

## [2.0.0](https://github.com/clutchprotocol/clutch-hub-sdk-js/compare/v1.22.1...v2.0.0) (2026-07-02)


### ⚠ BREAKING CHANGES

* authenticated methods (createUnsigned*, submitTransaction,
getAccountBalance) now require a private key via the constructor or
setPrivateKey(), and generateToken requires timestamp + signature. Requires
clutch-hub-api with the matching auth challenge.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>

### Features

* sign auth challenge for generateToken ([02c9f1e](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/02c9f1efa9db5cdecdb2ebc52744a9714254420b))

## [1.22.1](https://github.com/clutchprotocol/clutch-hub-sdk-js/compare/v1.22.0...v1.22.1) (2026-05-28)

## [1.22.0](https://github.com/clutchprotocol/clutch-hub-sdk-js/compare/v1.21.0...v1.22.0) (2026-05-22)


### Features

* **sdk:** add referrer parameter to ride request and offer mutations ([d7a6218](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/d7a6218e7c7c81cc3c2cfc62f1fd7aa96e92e7ef))

## [1.21.0](https://github.com/clutchprotocol/clutch-hub-sdk-js/compare/v1.20.0...v1.21.0) (2026-03-29)


### Features

* **sdk:** refactor subscription methods to utilize shared GraphQL WebSocket client ([6b5acb7](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/6b5acb7d5266216dbfc1eb0e9b69b53a6e41aa62))

## [1.20.0](https://github.com/clutchprotocol/clutch-hub-sdk-js/compare/v1.19.0...v1.20.0) (2026-03-29)


### Features

* **sdk:** implement shared GraphQL WebSocket client and token caching ([52e2724](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/52e2724677e7162bf583291f7931cd4895d26cfa))

## [1.19.0](https://github.com/clutchprotocol/clutch-hub-sdk-js/compare/v1.18.0...v1.19.0) (2026-03-25)


### Features

* **sdk:** add subscribeAccountBalance method for WebSocket updates ([b8d61ca](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/b8d61caed358afaa9bbd96924c59562704642271))

## [1.18.0](https://github.com/clutchprotocol/clutch-hub-sdk-js/compare/v1.17.1...v1.18.0) (2026-03-25)


### Features

* **sdk:** implement global JWT caching and deduplication for token generation ([5211cbc](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/5211cbc3067777d1584a3257996dea59bc56033b))

## [1.17.1](https://github.com/clutchprotocol/clutch-hub-sdk-js/compare/v1.17.0...v1.17.1) (2026-03-25)


### Bug Fixes

* **sdk:** update signHash method to align with Rust node verification ([aa38579](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/aa385799fc0c85406b0faa32349a9a198af709bf))

## [1.17.0](https://github.com/clutchprotocol/clutch-hub-sdk-js/compare/v1.16.0...v1.17.0) (2026-03-23)


### Features

* **sdk:** add recent trips subscription and listing methods ([61f4298](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/61f42985565dc04249dcb4a491968cc715c25ad5))

## [1.16.0](https://github.com/clutchprotocol/clutch-hub-sdk-js/compare/v1.15.0...v1.16.0) (2026-03-22)


### Features

* **sdk:** add requestFaucet method for test CLT retrieval ([a2a3fb2](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/a2a3fb2f5b4ac2c543e8de0d5bdb1c54d5a1336e))

## [1.15.0](https://github.com/clutchprotocol/clutch-hub-sdk-js/compare/v1.14.0...v1.15.0) (2026-03-21)


### Features

* **sdk:** add createUnsignedRideRequestCancel method for ride request cancellation ([ce53521](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/ce53521359b08cf5e594c5ee41e418bc81ffc91c))

## [1.14.0](https://github.com/clutchprotocol/clutch-hub-sdk-js/compare/v1.13.0...v1.14.0) (2026-03-21)


### Features

* **sdk:** add createUnsignedRideCancel method for ride cancellation ([0976a49](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/0976a4975b1828d85d32dfcff86de7ff6fa48e4b))

## [1.13.0](https://github.com/clutchprotocol/clutch-hub-sdk-js/compare/v1.12.0...v1.13.0) (2026-03-20)


### Features

* **sdk:** add GraphQL subscription methods for ride requests, offers, active trips, and completed trips ([5b0f3a2](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/5b0f3a26332e68165ed538ef179652e54c1fcdaa))

## [1.12.0](https://github.com/clutchprotocol/clutch-hub-sdk-js/compare/v1.11.0...v1.12.0) (2026-03-19)


### Features

* **sdk:** add listCompletedTrips method to fetch completed trips ([1339d07](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/1339d07eaa9b1cd5ac805e6864c8bb7a0031eb86))

## [1.11.0](https://github.com/clutchprotocol/clutch-hub-sdk-js/compare/v1.10.0...v1.11.0) (2026-03-19)


### Features

* **sdk:** add createUnsignedRidePay method and normalize transaction hash handling ([e895918](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/e895918d227be26106372dfe3b06f07e2b2f1350))

## [1.10.0](https://github.com/clutchprotocol/clutch-hub-sdk-js/compare/v1.9.0...v1.10.0) (2026-03-19)


### Features

* **sdk:** add listActiveTrips method to fetch active trips in progress ([5af3863](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/5af3863e44e7df768fe010501fb92b91ee66b96d))

## [1.9.0](https://github.com/clutchprotocol/clutch-hub-sdk-js/compare/v1.8.0...v1.9.0) (2026-03-19)


### Features

* **sdk:** add createUnsignedRideAcceptance method to fetch unsigned ride acceptance transactions from the GraphQL API ([aefdce2](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/aefdce2ffef841c0d94e8f39dc442561dade1b50))

## [1.8.0](https://github.com/clutchprotocol/clutch-hub-sdk-js/compare/v1.7.0...v1.8.0) (2026-03-18)


### Features

* **sdk:** add listRideOffers method to fetch available ride offers for a specific ride request ([c00de84](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/c00de84d648b7b5c2ea6afddf9defee952951ac1))

## [1.7.0](https://github.com/clutchprotocol/clutch-hub-sdk-js/compare/v1.6.0...v1.7.0) (2026-03-18)


### Features

* **sdk:** add createUnsignedRideOffer method to fetch unsigned ride offers from the GraphQL API ([8351902](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/83519026be3fddaf2f47c11ab052cfb3cc79c726))

## [1.6.0](https://github.com/clutchprotocol/clutch-hub-sdk-js/compare/v1.5.0...v1.6.0) (2026-03-17)


### Features

* **sdk:** add listRideRequests method to fetch available ride requests with optional map bounds filtering ([4c05d48](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/4c05d488f13eb64e7789fa9943d668339b43680a))

## [1.5.0](https://github.com/clutchprotocol/clutch-hub-sdk-js/compare/v1.4.0...v1.5.0) (2026-03-17)


### Features

* **sdk:** add getAccountBalance method to fetch current account balance for a public key ([58d9642](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/58d9642d553f9c19bfd3cb71dad44d04705737b1))

## [1.4.0](https://github.com/clutchprotocol/clutch-hub-sdk-js/compare/v1.3.0...v1.4.0) (2026-03-16)


### Features

* **sdk:** add stripHexPrefix utility function and refactor hex handling in transaction signing ([4365203](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/43652033701e963a85d2e4966402e02b5201617f))

## [1.3.0](https://github.com/clutchprotocol/clutch-hub-sdk-js/compare/v1.2.0...v1.3.0) (2025-08-23)


### Features

* **sdk:** add getPublicKey and isAuthenticated utility methods ([c0ac16e](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/c0ac16e1166cf9d6e4bcb5ae8cc37a17d6ae7028))


### Bug Fixes

* **auth:** add buffer time to prevent token expiration race conditions ([29b3b53](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/29b3b538dc260c34d80814da4723a5d13a140a48))


### Performance Improvements

* **sdk:** optimize float64ToUint64 conversion with cached buffers ([43a76b9](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/43a76b91cd05b737a5942a381653419816656fdd))

## [1.2.0](https://github.com/clutchprotocol/clutch-hub-sdk-js/compare/v1.1.0...v1.2.0) (2025-08-23)


### Features

* **ci:** enable git commits back to repository in semantic-release ([66016ac](https://github.com/clutchprotocol/clutch-hub-sdk-js/commit/66016aceb0418ef0506ab55c024eaa37d6b28bee))
