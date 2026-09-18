# Clutch Hub

The Clutch Hub JavaScript SDK and the reference app built on it, in one npm workspace.

| Path | What it is | Published as |
|---|---|---|
| [`packages/sdk`](packages/sdk) | The SDK: client-side signing, GraphQL queries and subscriptions | npm — [`clutch-hub-sdk-js`](https://www.npmjs.com/package/clutch-hub-sdk-js) |
| [`apps/demo`](apps/demo) | Reference passenger/driver UI, React 19 + Vite | Docker image `clutchprotocol/clutch-hub-demo-app`. `"private": true`, never published to npm |

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

One `npm install` at the root covers everything. The demo app depends on the SDK as a workspace, so
there is no separate SDK build step and no sibling checkout to keep in place.

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
