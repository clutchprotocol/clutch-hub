/**
 * Which chain a deployment is pointed at, decided by hostname.
 *
 * Pure and in its own module so it can be tested. `config.js` cannot: it reads `window` and
 * `import.meta.env` at module scope, and `import.meta.env` does not exist under `node --test`,
 * which is what runs this app's tests.
 *
 * This value is not cosmetic. CHAIN_ID is the pin for the chain-bound auth challenge and for
 * `signTransaction` verification, so a wrong one here means every transaction this app signs is
 * refused by the node — or, worse, that a challenge captured on one chain authenticates the same
 * key on another. That second risk is why the mainnet genesis was given a `chain_id` that is not
 * the testnet's.
 */

export const TESTNET_CHAIN_ID = 2077;
export const MAINNET_CHAIN_ID = 1000;

/**
 * Mainnet hosts are an ALLOW-LIST, and the default stays the testnet's id.
 *
 * Deliberately the opposite default from `IS_TESTNET`, which allow-lists testnet hosts and treats
 * the unknown as real. The two are answering different questions. `IS_TESTNET` decides whether to
 * print "go and get free USDT" next to a field that takes real money, so an unknown host must not
 * be told that. `chainIdForHost` decides a signing pin, where both wrong answers fail the same
 * way — the node rejects the transaction — so the safe default is the one that changes nothing for
 * every deployment that already exists.
 */
export function chainIdForHost(host) {
  if (typeof host !== "string") return TESTNET_CHAIN_ID;
  if (host === "app.clutchprotocol.io") return MAINNET_CHAIN_ID;
  return TESTNET_CHAIN_ID;
}

/**
 * The split-hostname API URL for a deployment, or null when the hostname says nothing.
 *
 * `app-stage.` is checked before `app.` only for readability — they cannot collide, because
 * "app-stage.clutchprotocol.io" does not start with "app.".
 */
export function apiUrlForHost(host, protocol) {
  if (typeof host !== "string") return null;
  const scheme = typeof protocol === "string" && protocol.length > 0 ? protocol : "https:";

  if (host.startsWith("app-stage.")) {
    return `${scheme}//${host.replace(/^app-stage\./, "api-stage.")}`;
  }
  // Backwards compatibility (older deployments).
  if (host.startsWith("stageweb.")) {
    return `${scheme}//${host.replace(/^stageweb\./, "stageapi.")}`;
  }
  if (host.startsWith("app.")) {
    return `${scheme}//${host.replace(/^app\./, "api.")}`;
  }
  return null;
}

/**
 * The block explorer for a deployment, or null when that network has none.
 *
 * Only the testnet has one: `app-stage.<domain>` -> `explorer-stage.<domain>`. The mainnet host
 * gets null on purpose. The stage explorer indexes the testnet chain, so a mainnet transaction
 * linked there would only ever show "not found". When a mainnet explorer exists, add
 * `app.` -> `explorer.` here.
 */
export function explorerUrlForHost(host, protocol) {
  if (typeof host !== "string" || !host.startsWith("app-stage.")) return null;
  const scheme = typeof protocol === "string" && protocol.length > 0 ? protocol : "https:";
  return `${scheme}//${host.replace(/^app-stage\./, "explorer-stage.")}`;
}

/**
 * The explorer page for one transaction, or null without an explorer or a hash.
 *
 * The SDK returns hashes as "0x" + lowercase hex. The explorer keys transactions by lowercase
 * hex without the prefix, and answers 404 for the prefixed or upper-case form.
 */
export function explorerTxUrl(explorerUrl, txHash) {
  if (!explorerUrl || typeof txHash !== "string" || txHash.length === 0) return null;
  return `${explorerUrl}/txs/${txHash.replace(/^0x/i, "").toLowerCase()}`;
}
