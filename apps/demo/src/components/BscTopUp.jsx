import React, { useState } from 'react';
import { ClutchHubSdk } from 'clutch-hub-sdk-js';
import { API_URL, CHAIN_ID, ORCHESTRATOR_BASE_URL } from '../config';
import { bscAmount, bscPlan, bscTxUrl, switchToBsc, transferData } from '../utils/bscTopUp';
import { readJsonBody, refusalMessage } from '../utils/orchestratorReply';
import { approveInWalletMessage, describeWalletError } from '../utils/walletSession';
import WalletNote from './WalletNote';

/**
 * "Pay with BNB Chain": for a person signed in with an Ethereum wallet, a BEP-20 USDT transfer on BNB
 * Smart Chain straight from their own address to the treasury (clutch-treasury `bsc_watch.rs`). On BSC
 * that address is their Clutch address, so the orchestrator credits it by sender. The orchestrator is
 * told first, because it credits only senders that asked before paying. The wallet charges BSC's
 * network fee in BNB, a few cents.
 */
const BscTopUp = ({ wallet, userProfile, testnet }) => {
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(null); // { hash, url }
  const [walletNote, setWalletNote] = useState('');

  const provider = wallet?.provider;
  const network = testnet ? 'BNB Smart Chain Testnet' : 'BNB Smart Chain';

  const pay = async () => {
    setError('');
    setSent(null);
    setBusy(true);
    try {
      if (!provider || typeof provider.request !== 'function') {
        throw new Error('Your wallet is not ready. Unlock it and try again.');
      }
      const { publicKey, signer } = userProfile;
      const sdk = new ClutchHubSdk(API_URL, publicKey, signer, CHAIN_ID);
      if (!sdk.hasValidToken()) setWalletNote(approveInWalletMessage('sign in to Clutch'));
      const authHeaders = await sdk.getAuthHeaders();
      setWalletNote('');

      const res = await fetch(`${ORCHESTRATOR_BASE_URL}/api/v1/bsc-topups`, { method: 'POST', headers: authHeaders });
      const body = await readJsonBody(res);
      if (res.status === 503) throw new Error('Paying on BNB Chain is not available right now. Use the address below.');
      if (!res.ok) throw new Error(body.error || refusalMessage(res.status, `request failed (${res.status})`));
      const plan = bscPlan(body);
      if (!plan) throw new Error('The service did not say where to pay. Nothing was sent.');
      const parsed = bscAmount(amount, plan.minimum, plan.decimals);
      if (parsed.error) throw new Error(parsed.error);

      // The transfer must come from the address the service will credit: the wallet's active account
      // can differ from the one signed in to Clutch if the person switched it since.
      const accounts = await provider.request({ method: 'eth_accounts' });
      const active = String(accounts?.[0] ?? '').toLowerCase();
      if (active !== plan.from) {
        throw new Error(
          `Your wallet is on ${active || 'no account'}, but you are signed in to Clutch as ${plan.from}. Switch the wallet back to that account. Nothing was sent.`,
        );
      }

      setWalletNote(approveInWalletMessage(`switch to ${network}`));
      await switchToBsc(provider, plan.chainId);
      setWalletNote(approveInWalletMessage('send the USDT'));
      const hash = await provider.request({
        method: 'eth_sendTransaction',
        params: [{ from: active, to: plan.contract, data: transferData(plan.payTo, parsed.units), value: '0x0' }],
      });
      setSent({ hash: String(hash), url: bscTxUrl(plan.chainId, String(hash)) });
      setAmount('');
    } catch (err) {
      console.error('BSC top-up failed', err);
      setError(describeWalletError(err, 'The transfer did not go through. Nothing was sent.'));
    } finally {
      setWalletNote('');
      setBusy(false);
    }
  };

  return (
    <div className="direct-topup">
      <h4 className="r-title">Pay with BNB Chain (BEP-20)</h4>
      <p className="deposit-hint">
        Send USDT on {network} straight from this wallet. No Clutch network fee: your wallet charges BNB Chain&apos;s own
        fee in BNB, usually a few cents, so keep a little BNB there.
      </p>
      <label className="label" htmlFor="bscTopUpAmount">
        Amount (USDT)
      </label>
      <input
        id="bscTopUpAmount"
        className="input-field"
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder="25"
        value={amount}
        disabled={busy}
        onChange={(e) => setAmount(e.target.value)}
      />
      <div className="deposit-actions">
        <button type="button" className="btn-primary" onClick={pay} disabled={busy || !amount.trim()}>
          {busy ? 'Waiting for your wallet…' : 'Pay with BNB Chain'}
        </button>
      </div>
      <WalletNote message={walletNote} />
      {error && <div className="status-banner error">{error}</div>}
      {sent && (
        <div className="status-banner success" role="status">
          Sent. It shows under Recent deposits within a minute or two, then as CLT.{' '}
          {sent.url ? (
            <a href={sent.url} target="_blank" rel="noopener noreferrer">
              View on BscScan
            </a>
          ) : (
            `Transaction ${sent.hash.slice(0, 10)}…`
          )}
        </div>
      )}
      <p className="r-note">
        Only from this wallet, never from an exchange: a payment from any other address is not credited automatically.
        Withdrawals are paid in USDT on Tron.{testnet ? ' Testnet: BSC testnet USDT only.' : ''}
      </p>
    </div>
  );
};

export default BscTopUp;
