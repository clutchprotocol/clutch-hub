import { useState } from 'react';
import { encryptWallet, decryptWallet, backupFilename } from '../utils/keystore';

/**
 * Wallet backup: write the key out under a passphrase, and read it back.
 *
 * The gap this fills is the one KeyStorageNotice describes. The key lives in plaintext
 * `localStorage`, so clearing site data, switching browsers or using another machine loses it, and
 * nothing anywhere can recover it. Import already existed — pasting a private key back in — which
 * only helps someone who kept a plaintext copy somewhere, which is the habit this app should not
 * be teaching.
 *
 * Export and restore are separate exports rather than one panel with tabs, because they belong in
 * different places: you back up from the menu while connected, and you restore from the sign-in
 * screen when you are not.
 */

const MIN_PASSPHRASE = 10;

export function WalletBackupExport({ role, userProfile }) {
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const privateKey = userProfile?.privateKey;
  const address = userProfile?.publicKey;

  const handleExport = async (e) => {
    e.preventDefault();
    setError(null);
    setDone(false);

    if (passphrase.length < MIN_PASSPHRASE) {
      setError(`Use at least ${MIN_PASSPHRASE} characters. This passphrase is the only thing protecting the key.`);
      return;
    }
    if (passphrase !== confirm) {
      setError('The two passphrases do not match.');
      return;
    }

    setBusy(true);
    try {
      const keystore = await encryptWallet({ address, privateKey }, passphrase);
      const blob = new Blob([JSON.stringify(keystore, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = backupFilename(role, address);
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoked on a timeout rather than immediately: Safari has been known to cancel a download
      // whose object URL disappears in the same tick.
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setPassphrase('');
      setConfirm('');
      setDone(true);
    } catch (err) {
      setError(err.message || 'Could not create the backup.');
    } finally {
      setBusy(false);
    }
  };

  if (!privateKey) {
    return (
      <div className="status-banner info">
        This browser holds an address but not its private key, so there is nothing to back up.
        A wallet connected by public key alone cannot sign, and cannot be exported.
      </div>
    );
  }

  return (
    <form onSubmit={handleExport}>
      <div className="status-banner warning" style={{ marginBottom: '1rem', lineHeight: 1.55 }}>
        <strong>The passphrase is the whole protection.</strong> The file is encrypted with it and
        nothing else — anyone who has both has your wallet. Lose the passphrase and the file is
        unopenable; there is no reset and no recovery.
      </div>

      <label className="label" htmlFor="backup-passphrase">Passphrase</label>
      <input
        id="backup-passphrase"
        type="password"
        className="input-field"
        style={{ marginBottom: '0.75rem' }}
        value={passphrase}
        onChange={(e) => setPassphrase(e.target.value)}
        placeholder={`At least ${MIN_PASSPHRASE} characters`}
        autoComplete="new-password"
      />

      <label className="label" htmlFor="backup-confirm">Confirm passphrase</label>
      <input
        id="backup-confirm"
        type="password"
        className="input-field"
        style={{ marginBottom: '0.75rem' }}
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder="Type it again"
        autoComplete="new-password"
      />

      {error && <div className="status-banner error" style={{ marginBottom: '0.75rem' }}>{error}</div>}
      {done && (
        <div className="status-banner success" style={{ marginBottom: '0.75rem' }}>
          Backup downloaded. Store it somewhere that is not this computer, and keep the passphrase
          somewhere else again.
        </div>
      )}

      <button type="submit" className="btn-primary" disabled={busy}>
        {busy ? 'Encrypting…' : 'Download encrypted backup'}
      </button>
    </form>
  );
}

export function WalletBackupRestore({ onRestore }) {
  const [file, setFile] = useState(null);
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const handleRestore = async (e) => {
    e.preventDefault();
    setError(null);

    if (!file) {
      setError('Choose a backup file first.');
      return;
    }

    setBusy(true);
    try {
      const text = await file.text();
      let keystore;
      try {
        keystore = JSON.parse(text);
      } catch {
        throw new Error('That file is not valid JSON, so it is not a Clutch backup.');
      }
      const wallet = await decryptWallet(keystore, passphrase);
      setPassphrase('');
      setFile(null);
      onRestore(wallet);
    } catch (err) {
      setError(err.message || 'Could not restore that backup.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleRestore}>
      <label className="label" htmlFor="restore-file">Backup file</label>
      <input
        id="restore-file"
        type="file"
        accept="application/json,.json"
        className="input-field"
        style={{ marginBottom: '0.75rem' }}
        onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null); }}
      />

      <label className="label" htmlFor="restore-passphrase">Passphrase</label>
      <input
        id="restore-passphrase"
        type="password"
        className="input-field"
        style={{ marginBottom: '0.75rem' }}
        value={passphrase}
        onChange={(e) => setPassphrase(e.target.value)}
        placeholder="The passphrase you chose when exporting"
        autoComplete="current-password"
      />

      {error && <div className="status-banner error" style={{ marginBottom: '0.75rem' }}>{error}</div>}

      <button type="submit" className="btn-primary" disabled={busy}>
        {busy ? 'Opening…' : 'Restore wallet'}
      </button>
    </form>
  );
}
