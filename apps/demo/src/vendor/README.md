# vendor

Third-party code that is copied into the repo instead of installed from npm. `qrcode-generator` is one
file with no dependencies, and copying it needed no change to `package-lock.json` (CI runs `npm ci`,
which fails when `package.json` and the lockfile disagree). It can become a normal npm dependency
later: change the import in `components/QrCode.jsx` and delete this folder.

## qrcode.js

- Package: `qrcode-generator` 1.4.4 by Kazuhiko Arase, MIT (see `LICENSE-qrcode-generator.txt`).
- Source: `https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js` (56,694 bytes).
- SHA-256 of the original file: `18ae399f81182bc9de916e9c77b195df20cc58d6f2d55a62b085a299f1bf1780`.
- One change: the UMD wrapper at the end of the file (`define` / `module.exports`) is replaced by
  `export default qrcode;`, so Vite can import it from `src/`. Everything else is the original text, so
  the change can be checked by downloading the original and diffing.
- Used by `components/QrCode.jsx` to draw the deposit address as a QR code. It handles only a public
  address, never a key.
- Excluded from ESLint (`eslint.config.js`).
