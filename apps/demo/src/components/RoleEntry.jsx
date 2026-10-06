import React from 'react';
import WalletConnect from './WalletConnect';
import EnvTag from './EnvTag';

const ROLE_STORAGE_KEY = 'clutch_demo_role';

export function persistRole(roleId) {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ROLE_STORAGE_KEY, roleId);
    }
  } catch {
    // ignore storage failures; role will just not persist
  }
}

const RoleEntry = ({ selectedRole, onSelectRole, connection }) => {
  const title = selectedRole ? 'Connect your wallet' : 'Select your account';
  const subtitle = selectedRole
    ? 'Use MetaMask, Trust Wallet or TronLink.'
    : 'Choose Driver or Passenger. You can switch later from Settings.';

  return (
    <div className="role-entry">
      <div className="role-entry-header">
        <div className="role-entry-brand">
          <img src="/clutch-logo.svg" alt="Clutch" className="role-entry-logo" width={40} height={40} />
          <EnvTag />
        </div>
        <h1 className="role-entry-title">{title}</h1>
        <p className="role-entry-subtitle">{subtitle}</p>
      </div>

      {!selectedRole ? (
        <div className="role-entry-buttons" aria-label="Select your account">
          <button
            type="button"
            className="role-entry-button role-entry-button--passenger"
            onClick={() => onSelectRole('passenger')}
          >
            <div className="role-entry-text">
              <span className="role-entry-label">Passenger</span>
              <span className="role-entry-hint">Request rides and pay instantly.</span>
            </div>
          </button>

          <button
            type="button"
            className="role-entry-button role-entry-button--driver"
            onClick={() => onSelectRole('driver')}
          >
            <div className="role-entry-text">
              <span className="role-entry-label">Driver</span>
              <span className="role-entry-hint">Accept rides and track earnings.</span>
            </div>
          </button>
        </div>
      ) : (
        <div className="role-entry-wallet">
          <WalletConnect
            wallets={connection.wallets}
            searching={connection.searching}
            connecting={connection.connecting}
            error={connection.error}
            onConnect={connection.connect}
            onSearch={connection.search}
          />
          <button
            type="button"
            className="btn-ghost role-entry-back"
            onClick={() => onSelectRole(null)}
          >
            Choose Driver or Passenger again
          </button>
        </div>
      )}
    </div>
  );
};

export default RoleEntry;
