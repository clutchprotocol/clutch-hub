import React, { useState } from 'react';
import { ClutchHubSdk } from 'clutch-hub-sdk-js';
import { API_URL, CHAIN_ID, IS_TESTNET, ORCHESTRATOR_BASE_URL } from '../config';
import { directAmount, directPlan } from '../utils/directTopUp';
import { readJsonBody, refusalMessage } from '../utils/orchestratorReply';
import { approveInWalletMessage, describeWalletError } from '../utils/walletSession';
import WalletNote from './WalletNote';

/** The most TRX TronLink may burn for the transfer's energy, in sun (100 TRX). A USDT transfer to an
 * address that already holds USDT needs far less; this is a ceiling, not a price. */
const FEE_LIMIT_SUN = 100_000_000;

/**
 * Send `micro` USDT from the TronLink account to `payTo`, and return the transaction id. TronLink
 * shows the transfer, its amount and its TRX fee, and the person approves it there.
 */
async function sendUsdt(tronWeb, plan, micro) {
  const contract = await tronWeb.contract().at(plan.contract);
  return contract.transfer(plan.payTo, micro.toString()).send({ feeLimit: FEE_LIMIT_SUN });
}

/**
 * "Pay from TronLink": for a person signed in with TronLink, a USDT transfer straight from their own
 * TRON address to the treasury (clutch-treasury `direct.rs`). No deposit address, no sweep and no
 * relay fee; TronLink charges TRON's network fee in TRX. The orchestrator is told first, because it
 * credits only senders that asked before paying.
 */
const DirectTopUp = ({ wallet, userProfile }) => {
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(null); // transaction id
  const [walletNote, setWalletNote] = useState('');

  const tronWeb = wallet?.provider?.tronWeb;

  const pay = async () => {
    setError('');
    setSent(null);
    setBusy(true);
    try {
      if (!tronWeb || typeof tronWeb.contract !== 'function') {
        throw new Error('TronLink is not ready. Unlock it and allow this site, then try again.');
      }
      const { publicKey, signer } = userProfile;
      const sdk = new ClutchHubSdk(API_URL, publicKey, signer, CHAIN_ID);
      if (!sdk.hasValidToken()) setWalletNote(approveInWalletMessage('sign in to Clutch'));
      const authHeaders = await sdk.getAuthHeaders();
      setWalletNote('');

      const res = await fetch(`${ORCHESTRATOR_BASE_URL}/api/v1/direct-topups`, { method: 'POST', headers: authHeaders });
      const body = await readJsonBody(res);
      if (res.status === 503) throw new Error('Paying from TronLink is not available right now. Use the address below.');
      if (!res.ok) throw new Error(body.error || refusalMessage(res.status, `request failed (${res.status})`));
      const plan = directPlan(body);
      if (!plan) throw new Error('The service did not say where to pay. Nothing was sent.');

      // The transfer must come from the address the service will credit: TronLink's own account
      // can differ from the one signed in to Clutch if the person switched it since.
      const active = tronWeb.defaultAddress?.base58;
      if (active !== plan.from) {
        throw new Error(
          `TronLink is on ${active || 'no account'}, but you are signed in to Clutch as ${plan.from}. Switch TronLink back to that account. Nothing was sent.`,
        );
      }
      const parsed = directAmount(amount, plan.minimum);
      if (parsed.error) throw new Error(parsed.error);

      setWalletNote(approveInWalletMessage('send the USDT'));
      const txId = await sendUsdt(tronWeb, plan, parsed.micro);
      setSent(String(txId));
      setAmount('');
    } catch (err) {
      console.error('direct top-up failed', err);
      setError(describeWalletError(err, 'The transfer did not go through. Nothing was sent.'));
    } finally {
      setWalletNote('');
      setBusy(false);
    }
  };

  return (
    <div className="direct-topup">
      <h4 className="r-title">Pay from TronLink</h4>
      <p className="deposit-hint">
        Send USDT straight from your TronLink account. No Clutch network fee: TronLink charges TRON&apos;s own fee in
        TRX from your wallet, usually a few TRX, so keep some TRX there.
      </p>
      <label className="label" htmlFor="directTopUpAmount">
        Amount (USDT)
      </label>
      <input
        id="directTopUpAmount"
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
          {busy ? 'Waiting for TronLink…' : 'Pay from TronLink'}
        </button>
      </div>
      <WalletNote message={walletNote} />
      {error && <div className="status-banner error">{error}</div>}
      {sent && (
        <div className="status-banner success" role="status">
          Sent. It shows under Recent deposits within a few minutes, then as CLT. Transaction {sent.slice(0, 10)}…
        </div>
      )}
      <p className="r-note">
        Only from TronLink, never from an exchange: a payment from any other address is not credited automatically.
        {IS_TESTNET ? ' Testnet: Nile USDT only.' : ''}
      </p>
    </div>
  );
};

export default DirectTopUp;
