import test from "node:test";
import assert from "node:assert/strict";
import {
  chainIdForHost,
  apiUrlForHost,
  TESTNET_CHAIN_ID,
  MAINNET_CHAIN_ID,
} from "./chain-for-host.js";

test("the mainnet host gets the mainnet chain id", () => {
  assert.equal(chainIdForHost("app.clutchprotocol.io"), MAINNET_CHAIN_ID);
  assert.equal(MAINNET_CHAIN_ID, 1000);
});

test("stage, local and unknown hosts keep the testnet id", () => {
  for (const h of [
    "app-stage.clutchprotocol.io",
    "stageweb.clutchprotocol.io",
    "localhost",
    "127.0.0.1",
    "somebody-elses-deployment.example",
    "",
  ]) {
    assert.equal(chainIdForHost(h), TESTNET_CHAIN_ID, `${h} must stay on the testnet id`);
  }
  // Unchanged behaviour for every deployment that existed before mainnet.
  assert.equal(TESTNET_CHAIN_ID, 2077);
});

test("a non-string host does not throw", () => {
  assert.equal(chainIdForHost(undefined), TESTNET_CHAIN_ID);
  assert.equal(apiUrlForHost(undefined, "https:"), null);
});

test("app- and app-stage- hostnames cannot be confused", () => {
  // The whole risk in one assertion: if `app.` matched `app-stage.`, the stage app would sign for
  // mainnet and talk to the mainnet API.
  assert.equal(chainIdForHost("app-stage.clutchprotocol.io"), TESTNET_CHAIN_ID);
  assert.equal(
    apiUrlForHost("app-stage.clutchprotocol.io", "https:"),
    "https://api-stage.clutchprotocol.io",
  );
  assert.equal(
    apiUrlForHost("app.clutchprotocol.io", "https:"),
    "https://api.clutchprotocol.io",
  );
});

test("the legacy stageweb mapping still works", () => {
  assert.equal(
    apiUrlForHost("stageweb.clutchprotocol.io", "https:"),
    "https://stageapi.clutchprotocol.io",
  );
});

test("an unknown host yields no API url, so the build-time value wins", () => {
  assert.equal(apiUrlForHost("example.com", "https:"), null);
});
