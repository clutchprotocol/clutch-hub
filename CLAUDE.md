# clutch-hub — CLAUDE.md

npm workspace holding the Clutch Hub SDK and the reference app that uses it. See the parent
`D:\source\clutch\CLAUDE.md` for the workspace-wide architecture; this file covers this repo only.

| Path | What | Notes |
|---|---|---|
| `packages/sdk` | `clutch-hub-sdk-js`, published to npm | TypeScript, `tsc` build, `node --test` |
| `apps/demo` | `clutch-hub-demo-app`, published as a Docker image | React 19 + Vite, `"private": true` |

Each has its own `CLAUDE.md` with the detail.

## Commands — all from the repo root

- `npm install` — installs both workspaces. The SDK's `prepare` builds it, so `dist/` exists after.
- `npm run dev` — the demo app on 5173.
- `npm run build` — the SDK. `npm run build:demo` for the app.
- `npm test` — both suites.

**The repo's GitHub name is still `clutch-hub-sdk-js`.** The npm package name and the repo name do
not have to match, and renaming the npm package would strand every existing consumer at the old
name. Renaming the *repo* is safe whenever you want it — GitHub redirects the old URL.

## Two things that are easy to break

**The paths filter in `.github/workflows/npm-publish.yml` is what stops a demo-app commit from
publishing an SDK version.** semantic-release has no concept of paths: it counts every commit since
the last tag and would happily cut `4.2.0` because the demo app got a `feat:`. If you widen that
filter, you take the guard off.

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
