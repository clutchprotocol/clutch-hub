import React, { useState } from 'react';
import { API_URL, EXPLORER_URL, IS_TESTNET } from '../config';
import { addClutchToWallet, canAddNetwork } from '../utils/walletNetwork';
import { describeWalletError } from '../utils/walletSession';

/**
 * "Add Clutch to wallet": adds the Clutch network to MetaMask or Trust Wallet, so the wallet shows
 * the CLT balance (see utils/walletNetwork.js). Not drawn for TronLink, which cannot add networks.
 * The wallet can show the balance only: sending from it is refused, so the note says where to send.
 */
const AddToWalletButton = ({ wallet }) => {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null); // { kind: 'success' | 'error', text } | null

  if (!canAddNetwork(wallet)) return null;

  const handleClick = async () => {
    setBusy(true);
    setStatus(null);
    try {
      await addClutchToWallet(wallet, { apiUrl: API_URL, explorerUrl: EXPLORER_URL, isTestnet: IS_TESTNET });
      setStatus({
        kind: 'success',
        text: `Added. ${wallet.name || 'Your wallet'} shows your CLT balance on the Clutch network. Send CLT from this app, not from the wallet.`,
      });
    } catch (err) {
      setStatus({ kind: 'error', text: describeWalletError(err, 'Could not add the Clutch network') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className="btn-secondary" onClick={handleClick} disabled={busy}>
        {busy ? 'Check your wallet…' : 'Add Clutch to wallet'}
      </button>
      {status && <div className={`status-banner ${status.kind}`}>{status.text}</div>}
    </>
  );
};

export default AddToWalletButton;
