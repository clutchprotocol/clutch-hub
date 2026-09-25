import { chainIdForHost, apiUrlForHost, explorerUrlForHost } from "./chain-for-host.js";

const host = typeof window !== "undefined" ? window.location.hostname : "";
const port = typeof window !== "undefined" ? window.location.port : "";
const protocol = typeof window !== "undefined" ? window.location.protocol : "http:";

// Cloudflare / split hostnames, one rule per environment:
//   app-stage.<domain>  ->  api-stage.<domain>   (testnet)
//   app.<domain>        ->  api.<domain>         (mainnet)
// The rules live in chain-for-host.js so they can be tested; config.js cannot be imported
// under `node --test`, because `import.meta.env` does not exist there.
const cloudflareStageApiUrl = apiUrlForHost(host, protocol);

// Legacy docker mapping: demo on :81, API on :82 (same host).
// e.g. http://localhost:81/ -> http://localhost:82/
const isStageWebOn81 = port === "81";
const legacyPort81ApiUrl = (() => {
  if (!isStageWebOn81) return null;
  return `${protocol}//${host}:82`;
})();

const viteApi = import.meta.env.VITE_API_URL;

/**
 * Is this deployment pointed at a TEST network?
 *
 * Drives testnet-only guidance -- the faucet instructions on the deposit panel, which tell people
 * to go and get free USDT. On a real deployment that text is worse than unhelpful: it frames real
 * money as play money, right next to a field that takes real money.
 *
 * So this is an ALLOW-LIST and must stay one. Unknown host means false, and a deployment that
 * genuinely is a testnet simply shows no faucet hint until its hostname is added here -- a missing
 * hint costs someone a support question, while a wrongly-shown one costs them USDT.
 *
 * Hostname-derived, like API_URL above, because the app has no other signal: which chain the
 * orchestrator watches is decided by its own config and never reaches the browser. If that ever
 * changes, read it from the server instead of guessing from a URL.
 */
export const IS_TESTNET =
  host.startsWith("app-stage.") ||
  host.startsWith("stageweb.") ||
  isStageWebOn81 ||
  host === "localhost" ||
  host === "127.0.0.1";

export const API_URL =
  cloudflareStageApiUrl ||
  legacyPort81ApiUrl ||
  (typeof viteApi === "string" && viteApi.length > 0 ? viteApi : null) ||
  "http://localhost:3000";

/**
 * This chain's id — pinned client-side (never sourced from the hub) for the chain-bound auth
 * challenge and as the `signTransaction` verification pin. See `ClutchHubSdk` constructor docs.
 */
const viteChainId = import.meta.env.VITE_CHAIN_ID;
// Hostname-derived, with the build-time value as an override, for the same reason API_URL is:
// one image serves every deployment. Without this the published demo image carries 2077 baked
// in, and a mainnet deployment would sign every transaction for the wrong chain.
export const CHAIN_ID =
  typeof viteChainId === "string" && viteChainId.trim().length > 0
    ? Number(viteChainId)
    : chainIdForHost(host);

/** Hub API base without trailing slash */
export const HUB_API_BASE_URL = API_URL.replace(/\/$/, "");

/**
 * payment-orchestrator base URL (deposit intents — `POST/GET /api/v1/deposits`).
 *
 * Unlike the hub API, the orchestrator has no split stage subdomain: clutch-deploy's nginx
 * proxies it same-origin at `/payment/` (see config/nginx/nginx*.conf), so the deployed default
 * is a relative path — no hostname sniffing needed. Local dev is the one case that's actually
 * cross-origin (Vite on :5173, orchestrator published on :8091), which is what `VITE_ORCHESTRATOR_URL`
 * (docker-compose.dev.yml) is for; the orchestrator's CORS config allows that origin.
 */
const viteOrchestrator = import.meta.env.VITE_ORCHESTRATOR_URL;
export const ORCHESTRATOR_BASE_URL =
  typeof viteOrchestrator === "string" && viteOrchestrator.trim().length > 0
    ? viteOrchestrator.replace(/\/$/, "")
    : "/payment";

/**
 * The block explorer for this network, or null when it has none (see explorerUrlForHost: only the
 * testnet has one today). The hostname decides for deployed hosts. `VITE_EXPLORER_URL` is only for
 * local dev, where the hostname says nothing (e.g. http://localhost:5174 from clutch-deploy's dev
 * stack). The published image does not set it, so one image stays correct on testnet and mainnet.
 */
const viteExplorer = import.meta.env.VITE_EXPLORER_URL;
export const EXPLORER_URL =
  explorerUrlForHost(host, protocol) ??
  (typeof viteExplorer === "string" && viteExplorer.trim().length > 0
    ? viteExplorer.replace(/\/$/, "")
    : null);

export const HUB_HEALTH_URL = `${HUB_API_BASE_URL}/health`;
export const HUB_GRAPHQL_HTTP_URL = `${HUB_API_BASE_URL}/graphql`;

/** Browser GraphQL subscriptions use this WebSocket URL (same host as Hub, `/graphql/ws`). */
export const HUB_GRAPHQL_WS_URL = (() => {
  try {
    const u = new URL(HUB_API_BASE_URL);
    u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
    u.pathname = "/graphql/ws";
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return "";
  }
})();

/**
 * Optional comma-separated list of node RPC/WebSocket URLs to show on the General tab
 * (e.g. stage operator). Not required for the app to run; the Hub talks to nodes server-side.
 */
const viteNodeEndpoints = import.meta.env.VITE_PUBLIC_NODE_ENDPOINTS;
export const PUBLIC_NODE_ENDPOINTS =
  typeof viteNodeEndpoints === "string" && viteNodeEndpoints.trim().length > 0
    ? viteNodeEndpoints
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

/**
 * Map tiles.
 *
 * CARTO's public basemaps (Voyager / Dark Matter) started requiring an API key: without one every tile
 * renders as an "API KEY REQUIRED" watermark, which is what stage showed. OpenStreetMap's standard
 * tiles need no key, so they are the default. Set VITE_CARTO_API_KEY to get CARTO back — it is a
 * basemap key meant to live in a browser bundle, domain-restricted on CARTO's side, not a secret.
 *
 * OSM has no dark basemap, so without a CARTO key the dark theme gets the light tiles. Cosmetic.
 * OSM's tile usage policy is fine for a testnet demo's traffic; a production launch should bring a key.
 */
const CARTO_API_KEY = import.meta.env.VITE_CARTO_API_KEY;

const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export const MAP_TILE_URL = CARTO_API_KEY
  ? `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?api_key=${CARTO_API_KEY}`
  : OSM_TILE_URL;
export const MAP_ATTRIBUTION = CARTO_API_KEY
  ? `${OSM_ATTRIBUTION} &copy; <a href="https://carto.com/attributions">CARTO</a>`
  : OSM_ATTRIBUTION;
