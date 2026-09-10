// Runs against dist/ — `npm run build` first. `node --test test/` (Node >= 20, no framework).
import test from 'node:test';
import assert from 'node:assert/strict';
import { ClutchHubSdk } from '../dist/index.js';

const HASH = 'ae174ce0588b221ed24d685518d486513187ab5ee649347062e75066a2aa9a37';

// The hub matches hash arguments as exact strings, without 0x and in lowercase. The SDK must
// send that form whatever the caller passed, or the hub answers with an empty list.
function sdkWithRecordingPost() {
  const sdk = new ClutchHubSdk('http://hub.test', '0x4196c526e2bb5dd02c2e2613b43291b0736afc47');
  const sent = [];
  sdk.apiClient.post = async (_url, body) => {
    sent.push(body);
    return { data: { data: { listRideOffers: [{ txHash: 'ff', rideRequestTxHash: HASH, fare: '5000000', driverAddress: '0x1' }] } } };
  };
  return { sdk, sent };
}

test('listRideOffers strips a 0x prefix before querying the hub', async () => {
  const { sdk, sent } = sdkWithRecordingPost();
  const offers = await sdk.listRideOffers('0x' + HASH);
  assert.equal(sent[0].variables.rideRequestTxHash, HASH);
  assert.equal(offers[0].fare, 5000000n);
});

test('listRideOffers lowercases and unquotes a legacy JSON-wrapped hash', async () => {
  const { sdk, sent } = sdkWithRecordingPost();
  await sdk.listRideOffers(JSON.stringify('0X' + HASH.toUpperCase()));
  assert.equal(sent[0].variables.rideRequestTxHash, HASH);
});

test('listRideOffers passes an already-normalized hash through unchanged', async () => {
  const { sdk, sent } = sdkWithRecordingPost();
  await sdk.listRideOffers(HASH);
  assert.equal(sent[0].variables.rideRequestTxHash, HASH);
});
