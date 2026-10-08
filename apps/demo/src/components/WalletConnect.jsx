import React from 'react';
import { isMobileUserAgent, walletHelpLinks } from '../utils/walletSession';

/**
 * "Connect your wallet": the one way into the app.
 *
 * This replaced the screen that made a key in the browser (2026-10-06). The app holds no key now:
 * the person's own wallet (MetaMask, Trust Wallet, TronLink) keeps it and signs each action after
 * asking. So this screen lists the wallets it finds, and when it finds none it says where to get
 * one, with a link that opens this page inside the wallet app on a phone (where most riders are).
 * A TronLink account is the same key as a Clutch account, so its entry carries a "TRON" tag, and a
 * note says that TronLink's `T…` address and the app's `0x…` address are one account.
 */
const WalletConnect = ({ wallets, searching, connecting, error, onConnect, onSearch }) => {
  const mobile = isMobileUserAgent(window.navigator.userAgent);
  const links = walletHelpLinks({ href: window.location.href, mobile });

  return (
    <div className="wallet-connect">
      <p className="wallet-connect-lead">
        Your wallet keeps your keys. This app never sees them. It asks your wallet to approve each
        action.
      </p>

      {searching && wallets.length === 0 && (
        <p className="wallet-connect-status" role="status">Looking for your wallet…</p>
      )}

      {wallets.length > 0 && (
        <div className="wallet-connect-list" role="group" aria-label="Wallets found in this browser">
          {wallets.map((wallet) => (
            <button
              key={wallet.id}
              type="button"
              className="wallet-connect-option"
              disabled={connecting}
              onClick={() => onConnect(wallet)}
            >
              {wallet.icon ? (
                <img className="wallet-connect-icon" src={wallet.icon} alt="" width={36} height={36} />
              ) : (
                <span className="wallet-connect-icon wallet-connect-icon--blank" aria-hidden="true" />
              )}
              <span className="wallet-connect-name">
                {wallet.name}
                {wallet.kind === 'tron' && <span className="wallet-connect-kind">TRON</span>}
              </span>
              <span className="wallet-connect-go">{connecting ? 'Check your wallet…' : 'Connect'}</span>
            </button>
          ))}
        </div>
      )}

      {!searching && !wallets.some((wallet) => !wallet.lazy) && (
        <div className="status-banner info wallet-connect-help" role="note">
          <strong>No wallet found in this browser.</strong>
          <span>
            Use MetaMask, Trust Wallet or TronLink.{' '}
            {mobile
              ? 'Open this page inside the wallet app:'
              : 'Install one, then come back and look again:'}
          </span>
          <span className="wallet-connect-links">
            {links.map((link) => (
              <a key={link.id} className="btn-secondary" href={link.url} rel="noopener noreferrer">
                {link.label}
              </a>
            ))}
          </span>
        </div>
      )}

      {!searching && (
        <button type="button" className="btn-ghost wallet-connect-again" onClick={onSearch}>
          Look for wallets again
        </button>
      )}

      {error && (
        <div className="status-banner error" role="alert">{error}</div>
      )}

      <p className="wallet-connect-note">
        For each action your wallet shows a short text that starts with <code>clutch-</code>. The
        app tells you what that action is before you approve it.
      </p>

      {wallets.some((wallet) => wallet.kind === 'tron') && (
        <p className="wallet-connect-note">
          TronLink shows your address as <code>T…</code>. This app shows the same account as{' '}
          <code>0x…</code>.
        </p>
      )}
    </div>
  );
};

export default WalletConnect;
