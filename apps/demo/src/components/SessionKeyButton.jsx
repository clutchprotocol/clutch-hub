import React from 'react';

/**
 * "Approve once for rides": one wallet prompt, then rides are signed without asking for a few
 * hours. Withdrawals always ask the wallet.
 */
const SessionKeyButton = ({ session }) => {
  const until = session.active
    ? new Date(session.expiresAtMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';
  return (
    <>
      <button
        type="button"
        className="btn-secondary"
        onClick={session.active ? session.disable : session.enable}
        disabled={session.busy}
      >
        {session.busy
          ? 'Check your wallet…'
          : session.active
            ? `Rides sign automatically until ${until} (turn off)`
            : 'Approve rides once (no prompt each time)'}
      </button>
      {session.error && <div className="status-banner error">{session.error}</div>}
    </>
  );
};

export default SessionKeyButton;
