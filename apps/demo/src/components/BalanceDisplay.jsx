import React, { useState, useEffect } from 'react';
import { useClutchSdk } from '../hooks/useClutchSdk';
import { formatUsd } from '../utils/money';

const BalanceDisplay = ({ publicKey }) => {
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(false);

  const sdk = useClutchSdk(publicKey || undefined, '0x0');

  useEffect(() => {
    if (!publicKey) return undefined;

    setLoading(true);
    const dispose = sdk.subscribeAccountBalance({ publicKey }, {
      onData: (value) => {
        setBalance(value);
        setLoading(false);
      },
      onError: (err) => {
        console.error('Balance subscription error:', err);
        setLoading(false);
      },
    });

    return () => dispose();
  }, [publicKey, sdk]);

  if (!publicKey) return null;

  if (loading) {
    return (
      <div className="wallet-balance" style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>...</div>
    );
  }

  if (balance === null) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
      <div style={{ textAlign: 'right' }} title={`${balance} CLT`}>
        <span className="wallet-balance">{formatUsd(BigInt(balance))}</span>
      </div>
    </div>
  );
};

export default BalanceDisplay;
