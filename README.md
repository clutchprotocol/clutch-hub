# Clutch Hub

The Clutch Hub: the Hub API, the JavaScript SDK that talks to it, and the reference app built on
the SDK. The SDK and the app are one npm workspace; the API is a Rust service beside them.

| Path | What it is | Published as |
|---|---|---|
| [`packages/sdk`](packages/sdk) | The SDK: client-side signing, GraphQL queries and subscriptions | npm — [`clutch-hub-sdk-js`](https://www.npmjs.com/package/clutch-hub-sdk-js) |
| [`apps/demo`](apps/demo) | Reference passenger/driver UI, React 19 + Vite | Docker image `clutchprotocol/clutch-hub-demo-app`. `"private": true`, never published to npm |
| [`services/hub-api`](services/hub-api) | The Hub API: GraphQL bridge between apps and clutch-node, JWT auth. Rust, Actix-web + async-graphql | Docker image `clutchprotocol/clutch-hub-api` |

## Using the SDK in your own app

Nothing here changes how you install it:

```bash
npm install clutch-hub-sdk-js
```

`apps/demo` is the worked example. It is a full application, it is built and tested on every
change to the SDK, and you can run it.

## Working in this repo

```bash
npm install     # installs both workspaces and builds the SDK
npm run dev     # runs the demo app on http://localhost:5173
npm run build   # builds the SDK
npm test        # runs both test suites
```

One `npm install` at the root covers the SDK and the demo app. The demo app depends on the SDK as a
workspace, so there is no separate SDK build step and no sibling checkout to keep in place.

The Hub API is not part of the npm workspace. Run cargo from its folder:

```bash
cd services/hub-api
cargo run       # loads config/default.toml, serves on http://localhost:3000
cargo test
```

`services/hub-api` came from the `clutch-hub-api` repo on 2026-09-24, with its history. Its commits never touch `packages/sdk`, so they never change the
SDK's version.

## Why these are one repo

They always were one unit, without git knowing it. The demo app depended on the SDK by relative
path (`file:../clutch-hub-sdk-js`), rebuilt it before every `dev` and `build`, and its CI checked
the SDK out beside itself to recreate the layout. Splitting them cost a cross-cutting change two
pull requests and meant no CI job ever tested the two together.

## Releases

`packages/sdk` is versioned by [semantic-release](https://semantic-release.gitbook.io/) from
[Conventional Commits](https://www.conventionalcommits.org/), on every push to `main` that touches
it. Tags stay `vX.Y.Z` and continue the series that ran before the merge.

A change under `apps/demo` alone does not cut an SDK release.
