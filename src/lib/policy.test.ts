import assert from "node:assert/strict";
import test from "node:test";
import { parseCeiling, quotePiece } from "./policy.ts";

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

test("reads a ceiling written with a dollar sign", () => {
  assert.equal(parseCeiling("Ceiling $880."), 880);
  assert.equal(parseCeiling("a $2,000 ceiling"), 2000);
});

test("reads a ceiling written as a bare number after a limit word", () => {
  assert.equal(parseCeiling("won't go over 500"), 500);
  assert.equal(parseCeiling("under 1,200.50"), 1200.5);
  assert.equal(parseCeiling("budget of 900"), 900);
  assert.equal(parseCeiling("no more than 750."), 750);
});

test("does not read sizes or postal codes as a ceiling", () => {
  assert.equal(parseCeiling("Austin 78702"), null);
  assert.equal(parseCeiling("under 60 inches wide"), null);
  assert.equal(parseCeiling("under 60 inches wide, $900"), 900);
});
