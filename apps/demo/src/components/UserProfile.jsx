import React, { useState, useEffect, useCallback } from 'react';
import { generateWallet } from '../utils/wallet';
import { WalletBackupRestore } from './WalletBackup';

const STORAGE_KEYS = {
  passenger: { publicKey: 'clutch_passenger_publicKey', privateKey: 'clutch_passenger_privateKey' },
  driver: { publicKey: 'clutch_driver_publicKey', privateKey: 'clutch_driver_privateKey' },
};

function truncateAddress(addr) {
  if (!addr || addr.length < 12) return addr || '';
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

const UserProfile = ({ role = 'passenger', onProfileUpdate }) => {
  const [publicKey, setPublicKey] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [rememberKeys, setRememberKeys] = useState(false);
  const [isProfileSaved, setIsProfileSaved] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showRestore, setShowRestore] = useState(false);
  const [copied, setCopied] = useState(false);

  const keys = STORAGE_KEYS[role] || STORAGE_KEYS.passenger;
  const walletLabel = role === 'driver' ? 'Driver Wallet' : 'Passenger Wallet';

  const updateParentProfile = useCallback((profileData) => {
    if (onProfileUpdate) onProfileUpdate(profileData);
  }, [onProfileUpdate]);

  useEffect(() => {
    const savedPublicKey = localStorage.getItem(keys.publicKey);
    const savedPrivateKey = localStorage.getItem(keys.privateKey);

    if (savedPublicKey) {
      let normalizedKey = savedPublicKey.trim();
      if (!normalizedKey.startsWith('0x')) normalizedKey = '0x' + normalizedKey;
      setPublicKey(normalizedKey);
      setRememberKeys(true);
      if (savedPrivateKey) setPrivateKey(savedPrivateKey);
      setIsProfileSaved(true);
      updateParentProfile({ publicKey: normalizedKey, privateKey: savedPrivateKey || '' });
    }
  }, [updateParentProfile, keys.publicKey, keys.privateKey]);

  const handleSaveProfile = (e) => {
    e.preventDefault();
    if (publicKey) {
      let normalizedKey = publicKey.trim();
      if (!normalizedKey.startsWith('0x')) normalizedKey = '0x' + normalizedKey;
      setPublicKey(normalizedKey);
      setIsProfileSaved(true);
      if (rememberKeys) {
        localStorage.setItem(keys.publicKey, normalizedKey);
        if (privateKey) localStorage.setItem(keys.privateKey, privateKey);
      } else {
        localStorage.removeItem(keys.publicKey);
        localStorage.removeItem(keys.privateKey);
      }
      if (onProfileUpdate) onProfileUpdate({ publicKey: normalizedKey, privateKey });
    }
  };

  const handleGenerateWallet = () => {
    const wallet = generateWallet();
    setPublicKey(wallet.address);
    setPrivateKey(wallet.privateKey);
    setRememberKeys(true);
    setIsProfileSaved(true);
    localStorage.setItem(keys.publicKey, wallet.address);
    localStorage.setItem(keys.privateKey, wallet.privateKey);
    if (onProfileUpdate) onProfileUpdate({ publicKey: wallet.address, privateKey: wallet.privateKey });
  };

  /**
   * A restored backup lands exactly where a generated wallet does: same storage keys, same parent
   * update, remembered on this device. The keystore already proved the private key derives to this
   * address, so there is nothing left to validate here.
   */
  const handleRestored = ({ address, privateKey: restoredKey }) => {
    setPublicKey(address);
    setPrivateKey(restoredKey);
    setRememberKeys(true);
    setIsProfileSaved(true);
    setShowRestore(false);
    localStorage.setItem(keys.publicKey, address);
    localStorage.setItem(keys.privateKey, restoredKey);
    if (onProfileUpdate) onProfileUpdate({ publicKey: address, privateKey: restoredKey });
  };

  const handleClearProfile = () => {
    setPublicKey('');
    setPrivateKey('');
    setIsProfileSaved(false);
    setRememberKeys(false);
    setShowImport(false);
    setShowRestore(false);
    localStorage.removeItem(keys.publicKey);
    localStorage.removeItem(keys.privateKey);
    if (onProfileUpdate) onProfileUpdate({ publicKey: '', privateKey: '' });
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(publicKey).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  if (isProfileSaved) {
    return (
      <div className="wallet-connected">
        <div className="wallet-address-group">
          <span
            className="wallet-address"
            onClick={handleCopy}
            title={publicKey}
          >
            {copied ? 'Copied!' : truncateAddress(publicKey)}
          </span>
        </div>
        <button type="button" onClick={handleClearProfile} className="btn-ghost" title="Disconnect">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
        </button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button type="button" onClick={handleGenerateWallet} className="btn-primary">
          Generate Wallet
        </button>
        <button
          type="button"
          onClick={() => { setShowImport(!showImport); setShowRestore(false); }}
          className="btn-secondary"
          style={{ fontSize: '0.8rem' }}
        >
          {showImport ? 'Cancel' : 'Import Existing'}
        </button>
        <button
          type="button"
          onClick={() => { setShowRestore(!showRestore); setShowImport(false); }}
          className="btn-secondary"
          style={{ fontSize: '0.8rem' }}
        >
          {showRestore ? 'Cancel' : 'Restore Backup'}
        </button>
      </div>
      {showRestore && (
        <div style={{ marginTop: '1rem' }}>
          <WalletBackupRestore onRestore={handleRestored} />
        </div>
      )}
      {showImport && (
        <form onSubmit={handleSaveProfile} style={{ marginTop: '1rem' }}>
          <label className="label">Public Key</label>
          <input
            type="text"
            value={publicKey}
            onChange={(e) => setPublicKey(e.target.value)}
            placeholder="0x..."
            className="input-field"
            style={{ marginBottom: '0.75rem' }}
            required
          />
          <label className="label">Private Key (optional)</label>
          <input
            type="password"
            value={privateKey}
            onChange={(e) => setPrivateKey(e.target.value)}
            placeholder="Enter private key"
            className="input-field"
            style={{ marginBottom: '0.5rem' }}
          />
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0 0 0.75rem 0' }}>
            Never share your private key.
          </p>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={rememberKeys} onChange={(e) => setRememberKeys(e.target.checked)} />
            Remember on this device
          </label>
          <button type="submit" className="btn-primary">Connect</button>
        </form>
      )}
    </div>
  );
};

export default UserProfile;
