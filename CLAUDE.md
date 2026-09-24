# clutch-hub — CLAUDE.md

The Clutch Hub: an npm workspace holding the SDK and the reference app that uses it, plus the Hub
API in `services/hub-api`. See the parent `D:\source\clutch\CLAUDE.md` for the workspace-wide
architecture; this file covers this repo only.

| Path | What | Notes |
|---|---|---|
| `packages/sdk` | `clutch-hub-sdk-js`, published to npm | TypeScript, `tsc` build, `node --test` |
| `apps/demo` | `clutch-hub-demo-app`, published as a Docker image | React 19 + Vite, `"private": true` |
| `services/hub-api` | `clutch-hub-api`, published as a Docker image | Rust 1.86. Not an npm workspace: run cargo from this folder |

`services/hub-api` came from `clutchprotocol/clutch-hub-api` on 2026-09-24, with its 112 commits,
by `git subtree add`. Its CI is `.github/workflows/hub-api-image.yml` and `hub-api-test.yml`.
Its history never touches `packages/sdk`, so `release/sdk-commits.mjs` keeps it out of SDK
releases. Merge a pull request that brings in history with a merge commit, never a squash.

Each has its own `CLAUDE.md` with the detail.

## Commands — all from the repo root

- `npm install` — installs both workspaces. The SDK's `prepare` builds it, so `dist/` exists after.
- `npm run dev` — the demo app on 5173.
- `npm run build` — the SDK. `npm run build:demo` for the app.
- `npm test` — both suites.

**The repo is `clutchprotocol/clutch-hub` since 2026-09-24, and the npm package is still
`clutch-hub-sdk-js`.** The two names do not have to match, and renaming the npm package would strand
every existing consumer at the old name. GitHub redirects the old repo URL. One thing did have to
change with the rename: `repository.url` in `packages/sdk/package.json`. Publishing uses npm
provenance, and npm refuses a publish when that URL does not match the repo that publishes.

## Three things that are easy to break

**`releaseRules` in `.releaserc.json` must keep `{ "breaking": true, "release": "major" }`.**
commit-analyzer uses its default rules only when no custom rule matches a commit, and the custom
`feat` rule always matches. So without that entry, a `feat!:` commit ships as a minor version. That
happened to 4.2.0, which contains `feat!: adopt SDK v3`. The first test in
`release/sdk-commits.test.mjs` fails if the entry goes missing.

**`release/sdk-commits.mjs` is what stops a demo-app commit from deciding an SDK version.**
semantic-release has no concept of paths: it counts every commit since the last tag, from every
folder. The `paths:` filter in `.github/workflows/npm-publish.yml` only decides when the release
job runs, so it was never a guard. That is why the 4.2.0 notes list the whole demo history. The
plugin gives the commit analyzer and the notes generator only the commits that touch
`packages/sdk`, and `release/sdk-commits.test.mjs` fails if it stops doing that. Before you change
the release setup, push a branch and read its "Release dry run" check.

**semantic-release runs from the repo root, not from `packages/sdk`.** This is deliberate.
`tagFormat` defaults to `v${version}`, which is the format of the existing `v1`..`v4` tags; running
it inside the package (or adding `semantic-release-monorepo`) changes the format, semantic-release
then finds no previous release, and the next publish is `1.0.0`. `pkgRoot` in `.releaserc.json` is
what aims the npm plugin at the package instead.

`@semantic-release/exec` regenerates the root `package-lock.json` after the version bump, because
the lockfile records each workspace's version and `npm ci` refuses a lockfile that disagrees with
`package.json`.

## Gotchas carried over from the split

- `apps/demo/vite.config.js` aliases `clutch-hub-sdk-js` to `../../packages/sdk` and excludes it
  from `optimizeDeps`. The alias points at the package directory, so `packages/sdk/dist/` must
  exist — `npm install` or `npm run build` produces it.
- The Docker build context is the **repo root**, not `apps/demo`: `docker build -f apps/demo/Dockerfile .`
  The `.dockerignore` that applies is the root one.
- `packages/sdk/package.json` has an explicit `files` field. Without it npm would pack whatever
  happens to sit in that directory — before the merge the published tarball carried `.releaserc.json`,
  the CI workflow, `CLAUDE.md` and three stray `test_rlp_fix*` scripts.
