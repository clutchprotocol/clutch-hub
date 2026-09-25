import React, { useEffect, useMemo, useState } from 'react';
import PassengerView from './components/PassengerView';
import DriverView from './components/DriverView';
import NetworkView from './components/NetworkView';
import GeneralView from './components/GeneralView';
import TransactionHistoryPage from './components/TransactionHistoryPage';
import ExplorerTabs from './components/ExplorerTabs';
import RoleEntry, { persistRole } from './components/RoleEntry';
import BalanceDisplay from './components/BalanceDisplay';
import DepositPanel from './components/DepositPanel';
import WithdrawPanel from './components/WithdrawPanel';
import { OverlayPanel } from './components/layout';
import { WalletBackupExport } from './components/WalletBackup';
import UpdatePrompt from './components/UpdatePrompt';
import { truncAddr } from './utils/address';
import { EXPLORER_URL } from './config';
import './App.css';

const ROLE_STORAGE_KEY = 'clutch_demo_role';

function App() {
  const initialStoredRole = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const stored = window.localStorage.getItem(ROLE_STORAGE_KEY);
    return stored === 'passenger' || stored === 'driver' ? stored : null;
  }, []);

  // mode: wallet mode ('passenger' | 'driver') selected via entry
  const [mode, setMode] = useState(initialStoredRole);
  // activeTab: current visible panel ('passenger' | 'driver' | 'hub')
  const [activeTab, setActiveTab] = useState(initialStoredRole || null);
  /** Sub-view when activeTab === 'hub' */
  const [hubSubTab, setHubSubTab] = useState('about');

  const [userProfile, setUserProfile] = useState({ publicKey: '', privateKey: '' });
  const [menuOpen, setMenuOpen] = useState(false);
  const [passengerViewTab, setPassengerViewTab] = useState(null);
  const [driverViewTab, setDriverViewTab] = useState(null);
  const [walletCopied, setWalletCopied] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);


  const handleCopyWalletAddress = async () => {
    if (!userProfile.publicKey) return;
    try {
      await navigator.clipboard.writeText(userProfile.publicKey);
      setWalletCopied(true);
      setTimeout(() => setWalletCopied(false), 1200);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleSignOut = () => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(ROLE_STORAGE_KEY);
        window.localStorage.removeItem('clutch_passenger_publicKey');
        window.localStorage.removeItem('clutch_passenger_privateKey');
        window.localStorage.removeItem('clutch_driver_publicKey');
        window.localStorage.removeItem('clutch_driver_privateKey');
      }
    } catch {
      // ignore storage errors; we still reset local state
    }
    setMode(null);
    setActiveTab(null);
    setUserProfile({ publicKey: '', privateKey: '' });
  };

  const handleEntryRoleSelect = (nextRole) => {
    setMode(nextRole);
    setActiveTab(nextRole);
    // Clear current profile so the wallet bar uses the newly selected mode.
    setUserProfile({ publicKey: '', privateKey: '' });
  };

  // Persist the chosen mode only after a wallet is actually selected (publicKey exists).
  useEffect(() => {
    if (mode && userProfile.publicKey) {
      persistRole(mode);
    }
  }, [mode, userProfile.publicKey]);

  // When the wallet becomes available, ensure the primary tab is set.
  useEffect(() => {
    if (mode && userProfile.publicKey && !activeTab) {
      setActiveTab(mode);
    }
  }, [mode, userProfile.publicKey, activeTab]);

  // Prevent switching to the opposite role view after role selection.
  useEffect(() => {
    if (!mode || !activeTab) return;
    if ((mode === 'passenger' && activeTab === 'driver') || (mode === 'driver' && activeTab === 'passenger')) {
      setActiveTab(mode);
    }
  }, [mode, activeTab]);

  const shouldShowEntry = !mode || !userProfile.publicKey;
  const isPassengerRecentActive = activeTab === 'passenger' && passengerViewTab === 'recent';
  const isDriverRecentActive = activeTab === 'driver' && driverViewTab === 'recent';
  const isRecentRidesActive = isPassengerRecentActive || isDriverRecentActive;

  if (shouldShowEntry) {
    return (
      <div className="app app--entry">
        <main className="app-main app-main--entry">
          <RoleEntry
            selectedRole={mode}
            onSelectRole={handleEntryRoleSelect}
            userProfile={userProfile}
            onProfileUpdate={setUserProfile}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div
        className="view-layer"
        role="tabpanel"
        id="role-panel-passenger"
        hidden={activeTab !== 'passenger'}
        style={{ display: activeTab === 'passenger' ? 'block' : 'none' }}
      >
        <PassengerView
          userProfile={userProfile}
          onProfileUpdate={setUserProfile}
          externalTab={passengerViewTab}
          onTabSync={setPassengerViewTab}
        />
      </div>
      <div
        className="view-layer"
        role="tabpanel"
        id="role-panel-driver"
        hidden={activeTab !== 'driver'}
        style={{ display: activeTab === 'driver' ? 'block' : 'none' }}
      >
        <DriverView
          userProfile={userProfile}
          onProfileUpdate={setUserProfile}
          externalTab={driverViewTab}
          onTabSync={setDriverViewTab}
        />
      </div>

      <header className="top-bar">
        <div className="top-pill top-pill--logo">
          <img src="/clutch-logo.svg" alt="Clutch" className="app-logo-icon" width={22} height={22} />
          <span className="top-bar-logo-text">Clutch Stage</span>
        </div>
        <div className="top-bar-right">
          {userProfile.publicKey && (
            <button
              type="button"
              className="top-pill top-pill--wallet"
              title={userProfile.publicKey}
              onClick={handleCopyWalletAddress}
            >
              {walletCopied ? 'Copied!' : truncAddr(userProfile.publicKey)}
            </button>
          )}
          <button
            type="button"
            className="top-pill top-pill--menu"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          >
            ☰
          </button>
        </div>
      </header>

      <OverlayPanel
        open={activeTab === 'hub'}
        title="About & network"
        onClose={() => setActiveTab(mode)}
      >
        <ExplorerTabs
          tabs={[
            { id: 'about', label: 'About', icon: 'ℹ️' },
            { id: 'transactions', label: 'Tx', icon: '📋' },
            { id: 'network', label: 'Network', icon: '🔍' },
          ]}
          activeTab={hubSubTab}
          onTabChange={setHubSubTab}
          showCounts={false}
        />
        <div
          role="tabpanel"
          id="panel-about"
          aria-labelledby="tab-about"
          hidden={hubSubTab !== 'about'}
          style={{ display: hubSubTab === 'about' ? 'block' : 'none' }}
        >
          <GeneralView />
        </div>
        <div
          role="tabpanel"
          id="panel-transactions"
          aria-labelledby="tab-transactions"
          hidden={hubSubTab !== 'transactions'}
          style={{ display: hubSubTab === 'transactions' ? 'block' : 'none' }}
        >
          <TransactionHistoryPage userPublicKey={userProfile.publicKey} />
        </div>
        <div
          role="tabpanel"
          id="panel-network"
          aria-labelledby="tab-network"
          hidden={hubSubTab !== 'network'}
          style={{ display: hubSubTab === 'network' ? 'block' : 'none' }}
        >
          <NetworkView />
        </div>
      </OverlayPanel>

      <OverlayPanel
        open={depositOpen}
        title="Top up with USDT"
        onClose={() => setDepositOpen(false)}
      >
        <DepositPanel
          userProfile={userProfile}
          open={depositOpen}
        />
      </OverlayPanel>

      <OverlayPanel
        open={withdrawOpen}
        title="Withdraw to USDT"
        onClose={() => setWithdrawOpen(false)}
      >
        <WithdrawPanel
          userProfile={userProfile}
          open={withdrawOpen}
        />
      </OverlayPanel>

      <UpdatePrompt />

      <OverlayPanel
        open={backupOpen}
        title="Back up wallet"
        onClose={() => setBackupOpen(false)}
      >
        <WalletBackupExport role={mode} userProfile={userProfile} />
      </OverlayPanel>

      <nav className="bottom-nav" aria-label="App navigation">
        <button
          type="button"
          className={`bottom-nav-item ${activeTab === mode && !isRecentRidesActive ? 'active' : ''}`}
          onClick={() => {
            if (mode === 'driver') {
              setDriverViewTab('rides');
              setActiveTab('driver');
            } else {
              setPassengerViewTab('rides');
              setActiveTab('passenger');
            }
          }}
        >
          <span className="bottom-nav-icon" aria-hidden>
            {mode === 'driver' ? '🚕' : '🚗'}
          </span>
          <span className="bottom-nav-label">Rides</span>
        </button>

        <button
          type="button"
          className={`bottom-nav-item ${isRecentRidesActive ? 'active' : ''}`}
          onClick={() => {
            if (mode === 'driver') {
              setDriverViewTab('recent');
              setActiveTab('driver');
            } else {
              setPassengerViewTab('recent');
              setActiveTab('passenger');
            }
          }}
        >
          <span className="bottom-nav-icon" aria-hidden>
            ✅
          </span>
          <span className="bottom-nav-label">Recent</span>
        </button>

        <button
          type="button"
          className={`bottom-nav-item ${activeTab === 'hub' ? 'active' : ''}`}
          onClick={() => setActiveTab('hub')}
        >
          <span className="bottom-nav-icon" aria-hidden>
            ⋯
          </span>
          <span className="bottom-nav-label">More</span>
        </button>
      </nav>

      {menuOpen && (
        <div className="app-menu-overlay" onClick={() => setMenuOpen(false)}>
          <aside className="app-menu" onClick={(e) => e.stopPropagation()}>
            <div className="app-menu-top-row">
              <span className="app-menu-title">Menu</span>
              <button
                type="button"
                className="app-menu-close-btn"
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
              >
                ×
              </button>
            </div>
            <div className="card app-menu-card">
              <div className="app-menu-section-header">
                <span className="app-menu-section-label">Profile</span>
              </div>
              <div className="app-menu-profile-card">
                <div className="app-menu-profile-head">
                  <div className="app-menu-profile-avatar" aria-hidden>
                    {mode === 'driver' ? 'D' : 'P'}
                  </div>
                  <div>
                    <div className="app-menu-profile-role-label">Role</div>
                    <div className="app-menu-profile-role-value">
                      <span style={{ textTransform: 'capitalize' }}>{mode}</span>
                    </div>
                  </div>
                </div>
                <div className="app-menu-profile-wallet">
                  <div className="app-menu-profile-role-label">Wallet</div>
                  {userProfile.publicKey ? (
                    <div className="app-menu-profile-wallet-row">
                      <button
                        type="button"
                        className="app-menu-wallet-address"
                        title={userProfile.publicKey}
                        onClick={handleCopyWalletAddress}
                      >
                        {walletCopied ? 'Copied!' : truncAddr(userProfile.publicKey)}
                      </button>
                      <BalanceDisplay
                        publicKey={userProfile.publicKey}
                      />
                    </div>
                  ) : (
                    <span className="app-menu-profile-wallet-empty">Not connected</span>
                  )}
                </div>
              </div>
              <div className="app-menu-actions">
                {userProfile.publicKey && (
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => {
                      setMenuOpen(false);
                      setDepositOpen(true);
                    }}
                  >
                    Top up with USDT
                  </button>
                )}
                {userProfile.publicKey && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setMenuOpen(false);
                      setWithdrawOpen(true);
                    }}
                  >
                    Withdraw to USDT
                  </button>
                )}
                {userProfile.publicKey && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setMenuOpen(false);
                      setBackupOpen(true);
                    }}
                  >
                    Back up wallet
                  </button>
                )}
                {/* A button, not a link, so it matches the actions above without new CSS. The
                    explorer is public, so it does not need a wallet; it shows only on networks
                    that have one (config EXPLORER_URL). */}
                {EXPLORER_URL && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setMenuOpen(false);
                      window.open(EXPLORER_URL, '_blank', 'noopener,noreferrer');
                    }}
                  >
                    Block explorer
                  </button>
                )}
                <button
                  type="button"
                  className="btn-secondary app-menu-signout-btn"
                  onClick={() => {
                    setMenuOpen(false);
                    handleSignOut();
                  }}
                >
                  Sign out
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

export default App;
