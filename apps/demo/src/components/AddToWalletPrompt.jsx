import { useState } from 'react';
import { API_URL, EXPLORER_URL, IS_TESTNET } from '../config';
import { addClutchToWallet, canAddNetwork } from '../utils/walletNetwork';
import { describeWalletError } from '../utils/walletSession';

// What the person did with the prompt: 'added' or 'dismissed'. Remembered so it asks once.
const PROMPT_STORAGE_KEY = 'clutch_wallet_network_prompt';

function readChoice() {
  try {
    return window.localStorage.getItem(PROMPT_STORAGE_KEY);
  } catch {
    return null;
  }
}

function rememberChoice(choice) {
  try {
    window.localStorage.setItem(PROMPT_STORAGE_KEY, choice);
  } catch {
    // Private mode: the prompt comes back next visit, which is harmless.
  }
}

/**
 * The main page's "Add Clutch to MetaMask": the same action as the menu's AddToWalletButton,
 * offered once on the map so people find it. It asks until the person adds the network or says
 * "Not now", and never again after either. Not drawn for TronLink, which cannot add networks.
 * Styled like UpdatePrompt, but under the top bar so the two never sit on each other.
 */
const AddToWalletPrompt = ({ wallet }) => {
  const [choice, setChoice] = useState(readChoice);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (choice || !canAddNetwork(wallet)) return null;

  const walletName = wallet.name || 'your wallet';

  const close = (next) => {
    rememberChoice(next);
    setChoice(next);
  };

  const handleAdd = async () => {
    setBusy(true);
    setError(null);
    try {
      await addClutchToWallet(wallet, { apiUrl: API_URL, explorerUrl: EXPLORER_URL, isTestnet: IS_TESTNET });
      close('added');
    } catch (err) {
      setError(describeWalletError(err, 'Could not add the Clutch network'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="update-prompt wallet-prompt" role="status">
      <span className="update-prompt-text">
        {error || `See your CLT in ${walletName}.`}
      </span>
      <button type="button" className="btn-primary update-prompt-btn" onClick={handleAdd} disabled={busy}>
        {busy ? 'Check your wallet…' : `Add to ${walletName}`}
      </button>
      <button type="button" className="update-prompt-dismiss" onClick={() => close('dismissed')}>
        Not now
      </button>
    </div>
  );
};

export default AddToWalletPrompt;
