import { useEffect, useState } from 'react';
import { subscribeToUpdate, reloadForUpdate } from '../pwaUpdate';

/**
 * "A new version is ready" — shown when a service worker is waiting, dismissed by reloading.
 *
 * Deliberately not a toast that fades. The old build keeps working, so there is no urgency, but
 * there is also no second chance to mention it: a toast that disappears after four seconds is how
 * someone ends up on a month-old build wondering why a fix never arrived.
 *
 * Dismissible, and the dismissal is not remembered. It comes back on the next load, because the
 * point is that the update is still waiting.
 */
const UpdatePrompt = () => {
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => subscribeToUpdate(setReady), []);

  if (!ready || dismissed) return null;

  return (
    <div className="update-prompt" role="status">
      <span className="update-prompt-text">A new version of the app is ready.</span>
      <button type="button" className="btn-primary update-prompt-btn" onClick={reloadForUpdate}>
        Reload
      </button>
      <button
        type="button"
        className="update-prompt-dismiss"
        onClick={() => setDismissed(true)}
        aria-label="Not now"
      >
        ×
      </button>
    </div>
  );
};

export default UpdatePrompt;
