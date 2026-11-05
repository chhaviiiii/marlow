import assert from "node:assert/strict";
import test from "node:test";
import { quotePiece } from "./policy.ts";

const desk = {
  id: "desk-walnut",
  name: "Writing desk, walnut",
  wood: "Walnut",
  size: "54 in",
  price: 840,
  cost: 468,
  leadDays: 11,
  blurb: "",
};

test("quotes a deposit inside the ceiling and the margin floor", () => {
  const decision = quotePiece(desk, { ceiling: 880, needBy: "2026-10-09" });
  assert.equal(decision.ok, true);
  if (!decision.ok) return;
  assert.equal(decision.deposit, 336);
  assert.equal(decision.balance, 504);
  assert.ok(decision.margin > 0.08);
});

test("refuses a piece above the buyer's ceiling", () => {
  const decision = quotePiece(desk, { ceiling: 700, needBy: "2026-10-09" });
  assert.equal(decision.ok, false);
});
