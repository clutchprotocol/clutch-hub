// Runs against dist/ — `npm run build` first. `node --test test/` (Node >= 20, no framework).
import test from 'node:test';
import assert from 'node:assert/strict';
import { ClutchHubSdk, DEFAULT_HTTP_TIMEOUT_MS } from '../dist/index.js';

const PK = '0x4196c526e2bb5dd02c2e2613b43291b0736afc47';

test('the hub HTTP client has a timeout by default', () => {
  const sdk = new ClutchHubSdk('http://hub.test', PK);
  assert.equal(DEFAULT_HTTP_TIMEOUT_MS, 30_000);
  assert.equal(sdk.apiClient.defaults.timeout, DEFAULT_HTTP_TIMEOUT_MS);
});

test('timeoutMs overrides the default, and 0 disables it', () => {
  assert.equal(new ClutchHubSdk('http://hub.test', PK, undefined, 2077, { timeoutMs: 5_000 }).apiClient.defaults.timeout, 5_000);
  assert.equal(new ClutchHubSdk('http://hub.test', PK, undefined, 2077, { timeoutMs: 0 }).apiClient.defaults.timeout, 0);
});

test('the four-argument constructor still works unchanged', () => {
  const sdk = new ClutchHubSdk('http://hub.test', PK, undefined, 2077);
  assert.equal(sdk.getPublicKey(), PK);
  assert.equal(sdk.apiClient.defaults.timeout, DEFAULT_HTTP_TIMEOUT_MS);
});
