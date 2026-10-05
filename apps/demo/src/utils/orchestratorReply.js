// How the Top up and Withdraw panels read the payment service's replies.
//
// A refused account gets an EMPTY 401 or 403, and a 502 from nginx is an HTML page. Calling `res.json()`
// on either throws "Unexpected end of JSON input" or "Unexpected token '<'". That is what the Top up tab
// showed on mainnet on 2026-10-05, when the pilot allowlist refused an account: a message about JSON, for
// a person who had done nothing wrong. So a reply is read as text first, and a body that is not JSON is
// an empty one.

/** The reply's JSON body, or `{}` when it has none (empty, or not JSON). Never throws. */
export async function readJsonBody(res) {
  try {
    const text = await res.text();
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

/** What to tell a person when the service refuses. `fallback` is for a status with no words of its own. */
export function refusalMessage(status, fallback) {
  if (status === 401) return 'Your session has expired. Sign in again.';
  if (status === 403) return 'This account is not allowed to do this yet.';
  if (status === 429) return 'Too many tries. Wait a minute and try again.';
  if (status >= 500) return 'The service is temporarily unavailable. Please try again later.';
  return fallback;
}
