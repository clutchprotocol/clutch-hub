import test from "node:test";
import assert from "node:assert/strict";
import { readJsonBody, refusalMessage } from "./orchestratorReply.js";

test("a JSON body is read", async () => {
  const body = await readJsonBody(new Response('{"error":"nope","n":2}', { status: 400 }));
  assert.deepEqual(body, { error: "nope", n: 2 });
});

test("an empty body, which is what a refused account gets, is an empty object and does not throw", async () => {
  assert.deepEqual(await readJsonBody(new Response("", { status: 403 })), {});
  assert.deepEqual(await readJsonBody(new Response(null, { status: 401 })), {});
});

test("an HTML body, which is what nginx sends for a 502, is an empty object and does not throw", async () => {
  assert.deepEqual(await readJsonBody(new Response("<html><body>502 Bad Gateway</body></html>", { status: 502 })), {});
});

test("a body that is cut off is an empty object and does not throw", async () => {
  assert.deepEqual(await readJsonBody(new Response('{"address":', { status: 200 })), {});
});

test("a reply object that cannot be read is an empty object and does not throw", async () => {
  assert.deepEqual(await readJsonBody({ text: () => Promise.reject(new Error("closed")) }), {});
});

test("a refused session, a refused account, a rate limit and a service that is down each say so", () => {
  assert.equal(refusalMessage(401, "x"), "Your session has expired. Sign in again.");
  assert.equal(refusalMessage(403, "x"), "This account is not allowed to do this yet.");
  assert.equal(refusalMessage(429, "x"), "Too many tries. Wait a minute and try again.");
  for (const s of [500, 502, 503, 504]) {
    assert.equal(refusalMessage(s, "x"), "The service is temporarily unavailable. Please try again later.");
  }
});

test("any other status keeps the caller's own words", () => {
  assert.equal(refusalMessage(400, "deposit request failed (400)"), "deposit request failed (400)");
  assert.equal(refusalMessage(404, "gone"), "gone");
});

test("no message talks about JSON, the thing the person did not do", () => {
  for (const s of [401, 403, 429, 500, 502, 503]) {
    assert.doesNotMatch(refusalMessage(s, "x"), /json/i);
  }
});
