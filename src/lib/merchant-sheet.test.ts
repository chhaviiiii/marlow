import assert from "node:assert/strict";
import test from "node:test";
import { containsPan } from "../server/agent-pay.ts";
import { checkSetup, MAX_CATALOG_BYTES, MAX_ROWS, parseCatalog, SAMPLE_SHOP } from "./merchant-sheet.ts";
import { quotePiece } from "./policy.ts";

const header = "name,price,cost,lead days\n";

test("reads the sample, with quoted commas in a name", () => {
  const { rows, errors } = parseCatalog(SAMPLE_SHOP.catalog);
  assert.deepEqual(errors, []);
  assert.equal(rows.length, 5);
  assert.equal(rows[0].name, "Mug, stoneware, 12 oz");
  assert.equal(rows[0].price, 34);
  assert.equal(rows[0].leadDays, 5);
});

test("handles a byte order mark, CRLF, blank lines, and doubled quotes", () => {
  const { rows, errors } = parseCatalog(`﻿${header.trim()}\r\n\r\n"The ""Good"" Bowl",50,10,3\r\n\r\n`);
  assert.deepEqual(errors, []);
  assert.equal(rows[0].name, 'The "Good" Bowl');
});

test("reads tab-separated text pasted from a spreadsheet", () => {
  const { rows, errors } = parseCatalog("name\tprice\tcost\tlead days\nBowl\t$1,250.50\t10\t3\n");
  assert.deepEqual(errors, []);
  assert.equal(rows[0].price, 1250.5);
});

test("reads a header in another column order", () => {
  const { rows } = parseCatalog("Lead Days,Cost,Name,Price\n3,10,Bowl,50\n");
  assert.equal(rows[0].name, "Bowl");
  assert.equal(rows[0].price, 50);
  assert.equal(rows[0].cost, 10);
  assert.equal(rows[0].leadDays, 3);
});

test("takes rows with no header in the sample's order", () => {
  const { rows, errors } = parseCatalog("Bowl,50,10,3\nPlate,40,10,3\n");
  assert.deepEqual(errors, []);
  assert.equal(rows.length, 2);
});

test("says when an extra column is not used", () => {
  const { rows, notes } = parseCatalog("name,price,cost,lead days,sku\nBowl,50,10,3,B-1\n");
  assert.equal(rows.length, 1);
  assert.match(notes[0].message, /1 extra column is not used/);
});

test("every bad row gets an error on its own line, and no row survives", () => {
  const sheet = parseCatalog(
    `${header}Good,50,10,3\n,50,10,3\nBad price,abc,10,3\nBad cost,50,-1,3\nBad lead,50,10,2.5\nShort,50\nGood,60,10,3\n`,
  );
  assert.equal(sheet.rows.length, 0);
  assert.deepEqual(
    sheet.errors.map((error) => error.line),
    [3, 4, 5, 6, 7, 8],
  );
  assert.match(sheet.errors[0].message, /Name is empty/);
  assert.match(sheet.errors[1].message, /Price is not an amount/);
  assert.match(sheet.errors[2].message, /Cost is not an amount/);
  assert.match(sheet.errors[3].message, /whole number/);
  assert.match(sheet.errors[4].message, /2 cells, not 4/);
  assert.match(sheet.errors[5].message, /already on line 2/);
});

test("an unquoted thousands comma is reported, not read as two cells", () => {
  const { errors } = parseCatalog(`${header}Lamp,1,200,500,14\n`);
  assert.match(errors[0].message, /5 cells, not 4.*quotes/);
});

test("a price of zero is refused, and so is exponent notation", () => {
  assert.match(parseCatalog(`${header}A,0,0,1\n`).errors[0].message, /Price must be from/);
  assert.match(parseCatalog(`${header}A,1e3,0,1\n`).errors[0].message, /not an amount/);
});

test("a quote that never closes is reported on the line it opens", () => {
  const { errors } = parseCatalog(`${header}Bowl,50,10,3\n"Plate,40,10,3\n`);
  assert.equal(errors[0].line, 3);
  assert.match(errors[0].message, /never closes/);
});

test("a header with no cost column is refused", () => {
  assert.match(parseCatalog("name,price,lead days\nBowl,50,3\n").errors[0].message, /no cost column/);
});

test("the row cap is enforced with a count, not a silent cut", () => {
  const rows = Array.from({ length: MAX_ROWS + 1 }, (_, index) => `Piece ${index},50,10,3`).join("\n");
  const sheet = parseCatalog(header + rows);
  assert.equal(sheet.rows.length, 0);
  assert.match(sheet.errors[0].message, /201 rows\. The limit is 200\. Remove 1\./);
  const full = Array.from({ length: MAX_ROWS }, (_, index) => `Piece ${index},50,10,3`).join("\n");
  assert.equal(parseCatalog(header + full).rows.length, MAX_ROWS);
});

test("piece ids are unique and can never be a demo id", () => {
  const { rows } = parseCatalog(`${header}Desk Walnut,840,468,11\n***,50,10,3\n`);
  assert.equal(rows[0].id, "desk-walnut-1");
  assert.equal(rows[1].id, "item-2");
});

const form = { ...SAMPLE_SHOP };

test("a good form gives ratios from the percents", () => {
  const checked = checkSetup(form, containsPan);
  assert.equal(checked.ok, true);
  if (!checked.ok) return;
  assert.equal(checked.setup.depositRatio, 0.3);
  assert.equal(checked.setup.minMargin, 0.15);
});

test("each bad field gets its own error", () => {
  const checked = checkSetup({ name: " ", city: "", depositPercent: "0", minMarginPercent: "96", catalog: "" });
  assert.equal(checked.ok, false);
  if (checked.ok) return;
  assert.deepEqual(Object.keys(checked.errors).sort(), ["catalog", "city", "depositPercent", "minMarginPercent", "name"]);
});

test("non-string input does not throw", () => {
  assert.equal(checkSetup(null).ok, false);
  assert.equal(checkSetup({ name: { a: 1 }, catalog: 5 }).ok, false);
});

test("a catalog over 1 MB is refused before it is read", () => {
  const checked = checkSetup({ ...form, catalog: "x".repeat(MAX_CATALOG_BYTES + 1) });
  assert.equal(checked.ok, false);
  if (checked.ok) return;
  assert.match(checked.errors.catalog ?? "", /over 1 MB/);
});

test("a card number is refused everywhere and never echoed", () => {
  const pan = "4111 1111 1111 1111";
  const inName = checkSetup({ ...form, name: `Shop ${pan}` }, containsPan);
  assert.equal(inName.ok, false);
  const inRow = checkSetup({ ...form, catalog: `${header}Bowl,${pan},10,3\n` }, containsPan);
  assert.equal(inRow.ok, false);
  assert.doesNotMatch(JSON.stringify([inName, inRow]), /4111/);
});

test("a piece under the margin floor is created with a plain warning", () => {
  const checked = checkSetup({ ...form, catalog: `${header}Thin,100,90,3\nFine,100,50,3\n` });
  assert.equal(checked.ok, true);
  if (!checked.ok) return;
  assert.equal(checked.setup.rows.length, 2);
  assert.equal(checked.setup.notes.length, 1);
  assert.match(checked.setup.notes[0].message, /Thin is under your 15% margin floor/);
});

const policy = { depositRatio: 0.25, minMargin: 0.3, captureOn: "ship" as const, currency: "USD", calendar: "live" as const };
const bowl = { id: "bowl-1", name: "Bowl", price: 100, cost: 75, leadDays: 3 };
const now = Date.parse("2026-11-05T12:00:00Z");
const needBy = "2026-11-10T12:00:00Z";

test("a merchant's deposit percent sets the deposit", () => {
  const decision = quotePiece({ ...bowl, cost: 50 }, { ceiling: 100, needBy }, policy, now);
  assert.equal(decision.ok, true);
  if (!decision.ok) return;
  assert.equal(decision.deposit, 25);
  assert.equal(decision.balance, 75);
  assert.match(decision.reason, /Deposit 25%/);
});

test("a merchant's margin floor refuses what the demo floor would pass", () => {
  const decision = quotePiece(bowl, { ceiling: 100, needBy }, policy, now);
  assert.equal(decision.ok, false);
  if (decision.ok) return;
  assert.match(decision.reason, /under the 30% floor/);
  assert.equal(quotePiece(bowl, { ceiling: 100, needBy }, undefined, now).ok, true);
});

test("a merchant's lead days count from today, not the demo week", () => {
  const live = { ...policy, minMargin: 0 };
  assert.equal(quotePiece(bowl, { ceiling: 100, needBy }, live, now).ok, true);
  const tooSoon = quotePiece({ ...bowl, leadDays: 6 }, { ceiling: 100, needBy }, live, now);
  assert.equal(tooSoon.ok, false);
});

test("the price comes from the catalog, whatever the ceiling", () => {
  const decision = quotePiece({ ...bowl, cost: 50 }, { ceiling: 100_000, needBy }, policy, now);
  assert.equal(decision.ok && decision.gross, 100);
});
