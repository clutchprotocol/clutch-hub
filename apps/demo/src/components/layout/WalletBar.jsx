import React from 'react';
import UserProfile from '../UserProfile';
import BalanceDisplay from '../BalanceDisplay';

const WalletBar = ({ role, userProfile, onProfileUpdate }) => (
  <div className="wallet-bar">
    <div className="card">
      <UserProfile role={role} onProfileUpdate={onProfileUpdate} />
      {userProfile?.publicKey && (
        <BalanceDisplay publicKey={userProfile.publicKey} />
      )}
    </div>
  </div>
);

export default WalletBar;
