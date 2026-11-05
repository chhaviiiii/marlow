import assert from "node:assert/strict";
import test from "node:test";
import { admit, containsPan, juniperPresentation, signIntent } from "./agent-pay.ts";

test("a registered agent with a bound mandate is admitted", () => {
  const decision = admit(juniperPresentation());
  assert.equal(decision.ok, true);
  if (!decision.ok) return;
  assert.equal(decision.admission.agentName, "Juniper");
  assert.equal(decision.admission.rail, "paypal-authorize");
  assert.match(decision.admission.tokenRef, /^tok_agt_juniper_household_/);
});

test("an unregistered agent is refused", () => {
  const presented = juniperPresentation();
  const decision = admit({ ...presented, agentId: "agt_stranger", signature: "deadbeef" });
  assert.equal(decision.ok, false);
});

test("a tampered mandate is refused", () => {
  const presented = juniperPresentation();
  const decision = admit({ ...presented, ceiling: 1 });
  assert.equal(decision.ok, false);
});

test("a card number is refused even from a registered agent", () => {
  const intent = {
    agentId: "agt_juniper_household",
    ceiling: 880,
    city: "Austin 78702",
    deliverBy: "2026-10-09T12:00:00-05:00",
    consent: true,
    note: "Charge 4111111111111111",
  };
  const decision = admit({ ...intent, signature: signIntent(intent, "juniper-registered-agent") });
  assert.equal(decision.ok, false);
  assert.equal(containsPan(intent.note), true);
});

test("consent is required", () => {
  const intent = {
    agentId: "agt_juniper_household",
    ceiling: 880,
    city: "Austin 78702",
    deliverBy: "2026-10-09T12:00:00-05:00",
    consent: false,
    note: "Just looking.",
  };
  const decision = admit({ ...intent, signature: signIntent(intent, "juniper-registered-agent") });
  assert.equal(decision.ok, false);
});
