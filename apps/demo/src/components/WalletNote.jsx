import React from 'react';

/**
 * The line shown while a wallet prompt is open. A wallet shows the text it signs, not the ride, so
 * the app says what that text is for (`approveInWalletMessage` writes the sentence). Renders
 * nothing when there is no message.
 */
const WalletNote = ({ message }) =>
  message ? (
    <p className="wallet-note" role="status">{message}</p>
  ) : null;

export default WalletNote;
