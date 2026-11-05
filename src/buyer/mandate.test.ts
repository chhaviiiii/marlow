import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { admit, containsPan } from "../server/agent-pay.ts";
import { DEMO_BUYERS } from "./demo-private-keys.mjs";
import { mandateTerms, signMandate, signTerms } from "./sign-mandate.mjs";

const { juniper, drift, northwind } = DEMO_BUYERS;

function swapPayload(token: string, change: (terms: Record<string, unknown>) => void) {
  const [header, payload, signature] = token.split(".");
  const terms = JSON.parse(Buffer.from(payload, "base64url").toString());
  change(terms);
  return `${header}.${Buffer.from(JSON.stringify(terms)).toString("base64url")}.${signature}`;
}

test("a mandate signed with the registered key is admitted", async () => {
  const gate = admit(await signMandate(juniper));
  assert.equal(gate.ok, true);
  if (!gate.ok) return;
  assert.equal(gate.admission.agentName, "Juniper");
  assert.equal(gate.admission.rail, "paypal-authorize");
  assert.match(gate.admission.tokenRef, /^tok_agt_juniper_household_/);
  assert.equal(gate.mandate.ceiling, 880);
});

test("the ceiling comes from the signed mandate", async () => {
  const gate = admit(await signMandate(northwind));
  assert.equal(gate.ok && gate.mandate.ceiling, 2000);
});

test("an unregistered agent is refused even with a real signature", async () => {
  const gate = admit(await signMandate(drift));
  assert.equal(gate.ok, false);
  if (gate.ok) return;
  assert.match(gate.reason, /Drift is not a registered agent/);
  assert.equal(gate.claimedBy, "Drift");
});

test("a stranger's key cannot sign for a registered agent", async () => {
  const { privateKey } = generateKeyPairSync("ed25519");
  const jwk = privateKey.export({ format: "jwk" });
  const gate = admit(await signTerms(jwk, mandateTerms(juniper)));
  assert.equal(gate.ok, false);
  if (gate.ok) return;
  assert.match(gate.reason, /does not match Juniper's registered key/);
});

test("raising the ceiling after signing breaks the signature", async () => {
  const token = swapPayload(await signMandate(northwind), (terms) => {
    terms.ceiling = 5000;
  });
  const gate = admit(token);
  assert.equal(gate.ok, false);
  if (gate.ok) return;
  assert.match(gate.reason, /does not match Northwind's registered key/);
});

test("a mandate works once", async () => {
  const token = await signMandate(juniper);
  assert.equal(admit(token).ok, true);
  const again = admit(token);
  assert.equal(again.ok, false);
  if (again.ok) return;
  assert.match(again.reason, /already used/);
});

test("a nonce cannot be spent again under a fresh signature", async () => {
  const nonce = crypto.randomUUID();
  assert.equal(admit(await signMandate(juniper, { nonce })).ok, true);
  assert.equal(admit(await signMandate(juniper, { nonce })).ok, false);
});

test("a Field & Grain mandate is refused by a created shop and keeps its nonce", async () => {
  const token = await signMandate(juniper);
  const gate = admit(token, Date.now(), "m_0123456789abcdef");
  assert.equal(gate.ok, false);
  if (gate.ok) return;
  assert.match(gate.reason, /signed for field-and-grain, not for this shop/);
  assert.equal(admit(token).ok, true);
});

test("a mandate for one created shop is refused by another and by the demo shop", async () => {
  const token = await signMandate(juniper, { merchant: "m_aaaaaaaaaaaaaaaa" });
  assert.equal(admit(token, Date.now(), "m_bbbbbbbbbbbbbbbb").ok, false);
  assert.equal(admit(token).ok, false);
  assert.equal(admit(token, Date.now(), "m_aaaaaaaaaaaaaaaa").ok, true);
});

test("a bad signature does not spend the nonce", async () => {
  const token = await signMandate(juniper);
  const [header, payload] = token.split(".");
  assert.equal(admit(`${header}.${payload}.AAAA`).ok, false);
  assert.equal(admit(token).ok, true);
});

test("an expired mandate is refused", async () => {
  const gate = admit(await signMandate(juniper, { expiresAt: new Date(Date.now() - 1000).toISOString() }));
  assert.equal(gate.ok, false);
  if (gate.ok) return;
  assert.match(gate.reason, /expired/);
});

test("a mandate with a very long life is refused", async () => {
  const gate = admit(await signMandate(juniper, { expiresAt: "2099-01-01T00:00:00Z" }));
  assert.equal(gate.ok, false);
  if (gate.ok) return;
  assert.match(gate.reason, /more than 24 hours/);
});

test("a mandate signed for another merchant is refused", async () => {
  const gate = admit(await signMandate(juniper, { merchant: "some-other-shop" }));
  assert.equal(gate.ok, false);
});

test("consent is required", async () => {
  const gate = admit(await signMandate(juniper, { consent: false }));
  assert.equal(gate.ok, false);
  if (gate.ok) return;
  assert.match(gate.reason, /no consent/);
});

test("a card number is refused even from a registered agent", async () => {
  const note = "Charge 4111111111111111";
  const gate = admit(await signMandate(juniper, { note }));
  assert.equal(gate.ok, false);
  assert.equal(containsPan(note), true);
});

test("garbage and other algorithms are refused", async () => {
  for (const token of ["", "plain words", "a.b.c", "a.b.c.d"]) {
    assert.equal(admit(token).ok, false);
  }
  const [, payload, signature] = (await signMandate(juniper)).split(".");
  const none = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
  assert.equal(admit(`${none}.${payload}.${signature}`).ok, false);
});

test("an agent id from Object.prototype is not a registered agent", async () => {
  const gate = admit(await signMandate({ ...juniper, agentId: "constructor" }));
  assert.equal(gate.ok, false);
});
