# Clutch Hub Demo App

![Alpha](https://img.shields.io/badge/status-alpha-orange.svg)
![Experimental](https://img.shields.io/badge/stage-experimental-red.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![React](https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat&logo=vite&logoColor=white)

> ⚠️ **ALPHA SOFTWARE** - This project is in active development and is considered experimental. Use at your own risk. Features may not work as expected and APIs may change without notice.

A decentralized ride-sharing application showcasing blockchain integration using the Clutch Hub SDK.

**Documentation:** https://docs.clutchprotocol.io/demo-app/overview

**Created and maintained by [Mehran Mazhar](https://github.com/MehranMazhar)**

## Environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Hub API base URL | `http://localhost:3000` |

Stage auto-detection: `app-stage.*` hostname maps to `api-stage.*`. See [Environments](https://docs.clutchprotocol.io/getting-started/environments).

## Live demos

- https://demo.clutchprotocol.io
- https://app-stage.clutchprotocol.io

## Features

### Connect your wallet
- Sign in with a wallet you already have: MetaMask, Trust Wallet or TronLink. The app holds no key
- On a phone, a link opens the page inside the wallet app; on a computer, a link to install the wallet
- Remembers which wallet you used, never a key, and connects again on the next visit without a prompt
- Follows the wallet: switching account in the wallet switches the account in the app

### Staying current
- Installable as a PWA, and a new build announces itself rather than arriving unasked
- `registerType` is `'prompt'`, not `'autoUpdate'`: a silent reload can take the page away
  mid-ride, losing a half-entered fare or a pickup pin. A persistent banner with a **Reload**
  button hands that timing to the user instead
- It does not fade. The old build keeps working so there is no urgency, but there is also no second
  chance to mention it

### Ride Request
- Interactive map to select pickup and dropoff locations
- Simple fare input
- Your wallet asks you to approve each action, and the app says what each prompt is for
- Visual feedback during transaction processing

### Transaction History
- Records all ride requests (successful and failed)
- Collapsible interface to save space
- Persistent storage tied to user's public key

## Security Considerations

- The app never holds a private key: your wallet keeps it and signs after you approve
- Nothing that can sign is stored in the browser. Only the id of the wallet you used is remembered
- A wallet shows the text it signs (`clutch-tx:…`), not the ride, so the app says what each prompt is for before you approve it
- All blockchain interactions happen client-side

## Decentralization Benefits

This application demonstrates several key blockchain principles:

1. **User sovereignty**: Users own and control their keys, in their own wallet
2. **Transparency**: All transactions are recorded and visible
3. **No central authority**: Ride requests are processed by the blockchain network
4. **Trustless operations**: Smart contracts enforce the rules without third-party oversight

## Getting Started

The demo uses **`clutch-hub-sdk-js`** from the **sibling checkout** — `package.json` declares it as `file:../clutch-hub-sdk-js`, and `predev`/`prebuild` build that repo first. So the SDK must be cloned next to this one, and an SDK change shows up here on the next `npm run dev`.

This README previously said the SDK came from npm at `^1.13.0`. That has not been true for a long time and would not work if it were: the wire format broke at 3.0.0, and the published package is now 4.x.

**Live lists:** `src/sdkRealtime.js` calls `subscribeRideRequests` / `subscribeRideOffers` / etc. when the installed SDK defines them (GraphQL over **WebSocket** to `/graphql/ws`). If those methods are missing (older npm package), the same UI falls back to **HTTP polling** so the app still runs.

**Using a published SDK instead:** the sibling checkout is the default, not a workaround. To build against a registry version, replace `file:../clutch-hub-sdk-js` in `package.json` with a version range and drop the `build:sdk` step from `predev`/`prebuild` — that link is what makes them meaningful. `vite.config.js` also aliases the package to `../clutch-hub-sdk-js` and excludes it from `optimizeDeps`, which would need removing too.

1. Clone the repository
2. Install dependencies with `npm install`
3. Start the development server with `npm run dev`
4. Visit `http://localhost:5173` in your browser

### Docker

```bash
# Build (API URL defaults to http://localhost:3000)
docker build -t clutch-hub-demo-app .

# Run
docker run -p 5173:80 clutch-hub-demo-app
```

Or use [clutch-deploy](https://github.com/clutchprotocol/clutch-deploy) with `--profile demo` to run the full stack including the demo app.

## Development

### Dependencies
- React for UI components
- Leaflet for interactive maps
- Clutch Hub SDK for blockchain interactions: `packages/sdk` in this repo, used as an npm
  workspace. An SDK change reaches the app without a publish step.

### Wallets, and what is stored

The app holds no key. Until 2026-10-06 it generated one in the browser and stored it in
`localStorage` in plain text, with a backup file. That is gone, on the testnet too: the person's
own wallet keeps the key and signs. The SDK takes a signer where it used to take a key, so a
hardware wallet or an external signer substitutes in the same way. See
[Mainnet Readiness](https://docs.clutchprotocol.io/reference/mainnet-readiness) item F1.

What the app stores in `localStorage`:

- `clutch_wallet_id` — which wallet was used last (for example `io.metamask`), so that the next visit connects without a prompt
- `clutch_demo_role` — which role was last used
  (`clutch_demo_theme` is gone: the app has one palette since dark mode was removed on 2026-09-14, so any value left over from an older build is inert)
- `clutch_tx_{publicKey}` — the last ~10 local transaction records, for the history panel

The first time the app starts after this change it deletes the `clutch_{passenger|driver}_{publicKey|privateKey}` entries that older versions left behind.

Not built yet: WalletConnect (a phone wallet that scans a code shown on a computer).

## Best Practices

The application follows blockchain best practices:
- Never holds a private key: a wallet signs each action after you approve it
- Keeps transaction history for transparency
- Provides clear feedback on transaction status

## Project Structure

```
clutch-hub-demo-app/
├── public/
├── src/
│   ├── components/
│   │   └── RideForm.jsx         // Ride request form component
│   ├── App.jsx                  // Main app component
│   ├── main.jsx                 // React entry point
│   └── config.js                // API config (e.g., export const API_URL)
├── package.json
├── vite.config.js
├── README.md
└── .gitignore
```

## Using the Clutch Hub SDK

This app depends on the SDK by path, not by version: `"clutch-hub-sdk-js": "file:../clutch-hub-sdk-js"`.
The `predev` and `prebuild` scripts build that sibling checkout first, so the app always runs against
the SDK source next to it. Changes to the SDK show up here after a rebuild.

The published image is built the same way. `Dockerfile` copies both repos, builds the SDK, then runs
`npm run build` in this app, so an image is a snapshot of both checkouts rather than of an npm
version range.

```bash
npm run dev          # builds the SDK, then starts Vite on 5173
npm run build        # builds the SDK, then builds this app
npm run build:sdk    # rebuild only the SDK
npm run check:sdk    # show which SDK is linked
```

If you want to depend on the registry copy instead, install it explicitly
(`npm install clutch-hub-sdk-js@4.1.0`) and drop the `predev`/`prebuild` hooks. Pin an exact
version if you do: the SDK's 3.0.0 changed the signed wire format, so a range that crosses it
produces transactions the node rejects.

---

Stay true to the philosophy of decentralization and blockchain.

## Author & Maintainer

**Mehran Mazhar**
- GitHub: [@MehranMazhar](https://github.com/MehranMazhar)
- Website: [MehranMazhar.com](https://MehranMazhar.com)
- Email: mehran.mazhar@gmail.com

# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
