/**
 * Reads what a merchant typed on /setup. Pure, so the browser can share the
 * limits and the tests can run it with no server. A bad row stops the whole
 * sheet: nothing is dropped, and nothing is created until every row reads.
 */

export const MAX_ROWS = 200;
export const MAX_CATALOG_BYTES = 1024 * 1024;
const MAX_SHOP_TEXT = 60;
const MAX_PIECE_NAME = 80;
const MAX_MONEY = 99_999.99;
const MIN_PRICE = 1;
const MAX_LEAD_DAYS = 365;

export const SAMPLE_SHOP = {
  name: "Ember Road Ceramics",
  city: "Portland",
  depositPercent: "30",
  minMarginPercent: "15",
  catalog: `name,price,cost,lead days
"Mug, stoneware, 12 oz",34,11,5
Serving bowl,78,26,7
"Dinner plates, set of four",120,48,10
Tall vase,96,35,8
Table lamp,240,110,14
`,
};

export type RowProblem = { line: number | null; message: string };

export type SheetRow = {
  id: string;
  name: string;
  price: number;
  cost: number;
  leadDays: number;
  line: number;
};

export type Sheet = { rows: SheetRow[]; errors: RowProblem[]; notes: RowProblem[] };

type Sensitive = (text: string) => boolean;

const SENSITIVE_MESSAGE = "This looks like a card number. Remove it. Marlow does not take card numbers.";
const CONTROL = /[\u0000-\u001f\u007f]/;
/** Error messages name the line, never the cell, so a mistyped card number is not sent back. */
const PLAIN_MONEY = /^\$?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?$/;

const HEADERS: Record<string, keyof typeof COLUMNS> = {
  name: "name",
  item: "name",
  product: "name",
  price: "price",
  cost: "cost",
  lead: "lead",
  "lead days": "lead",
  "lead time": "lead",
  leaddays: "lead",
  lead_days: "lead",
};

const COLUMNS = { name: 0, price: 1, cost: 2, lead: 3 };

/** RFC 4180 rows, with the line each one starts on. Quoted cells may hold commas and line breaks. */
function readRows(text: string, delimiter: string) {
  const rows: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let start = 1;
  let quoteOpenedOn = 0;

  const endRow = () => {
    cells.push(cell.trim());
    if (cells.some(Boolean)) rows.push({ line: start, cells });
    cells = [];
    cell = "";
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        if (char === "\n") line += 1;
        cell += char;
      }
    } else if (char === '"' && !cell.trim()) {
      quoted = true;
      quoteOpenedOn = line;
      cell = "";
    } else if (char === delimiter) {
      cells.push(cell.trim());
      cell = "";
    } else if (char === "\n") {
      endRow();
      line += 1;
      start = line;
    } else if (char !== "\r") {
      cell += char;
    }
  }
  const openQuote = quoted ? quoteOpenedOn : null;
  endRow();
  return { rows, openQuote };
}

function readMoney(raw: string, label: string, min: number) {
  if (!raw) return { error: `${label} is empty.` };
  if (!PLAIN_MONEY.test(raw)) return { error: `${label} is not an amount. Write it like 120 or 120.50.` };
  const value = Number(raw.replace(/[$,]/g, ""));
  if (value < min || value > MAX_MONEY) {
    return { error: `${label} must be from $${min} to $${MAX_MONEY.toLocaleString("en-US")}.` };
  }
  return { value };
}

function slug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
}

/** Maps each column to its cell. A sheet with no header line must be in the sample's order. */
function columnsOf(first: string[]) {
  const named = first.map((cell) => HEADERS[cell.toLowerCase()]);
  if (!named.includes("name") || !named.includes("price")) return { hasHeader: false, order: COLUMNS, extra: [] };
  const order = { name: named.indexOf("name"), price: named.indexOf("price"), cost: named.indexOf("cost"), lead: named.indexOf("lead") };
  return { hasHeader: true, order, extra: first.filter((_, index) => !named[index]) };
}

export function parseCatalog(text: string, isSensitive: Sensitive = () => false): Sheet {
  const errors: RowProblem[] = [];
  const notes: RowProblem[] = [];
  const clean = text.replace(/^﻿/, "");
  if (!clean.trim()) return { rows: [], errors: [{ line: null, message: "The catalog is empty. Add at least one row." }], notes };

  const firstLine = clean.split("\n", 1)[0];
  const delimiter = firstLine.includes("\t") && !firstLine.includes(",") ? "\t" : ",";
  const { rows, openQuote } = readRows(clean, delimiter);
  if (openQuote) {
    return { rows: [], errors: [{ line: openQuote, message: "A quote opens here and never closes." }], notes };
  }

  const { hasHeader, order, extra } = columnsOf(rows[0]?.cells ?? []);
  if (order.cost < 0 || order.lead < 0) {
    const missing = [order.cost < 0 && "cost", order.lead < 0 && "lead days"].filter(Boolean).join(" and ");
    return { rows: [], errors: [{ line: 1, message: `The header has no ${missing} column.` }], notes };
  }
  if (extra.length) {
    notes.push({ line: 1, message: `${extra.length} extra ${extra.length === 1 ? "column is" : "columns are"} not used.` });
  }

  const body = hasHeader ? rows.slice(1) : rows;
  if (!body.length) return { rows: [], errors: [{ line: null, message: "The catalog has a header but no rows." }], notes };
  if (body.length > MAX_ROWS) {
    return {
      rows: [],
      errors: [{ line: null, message: `The catalog has ${body.length} rows. The limit is ${MAX_ROWS}. Remove ${body.length - MAX_ROWS}.` }],
      notes,
    };
  }

  const expected = hasHeader ? rows[0].cells.length : 4;
  const seen = new Map<string, number>();
  const parsed: SheetRow[] = [];

  body.forEach(({ line, cells }, index) => {
    const fail = (message: string) => errors.push({ line, message });
    if (cells.some(isSensitive)) return fail(SENSITIVE_MESSAGE);
    if (cells.length !== expected) {
      return fail(`This row has ${cells.length} cells, not ${expected}. Put quotes around any name or price with a comma.`);
    }

    const name = cells[order.name];
    const before = errors.length;
    if (!name) fail("Name is empty.");
    else if (name.length > MAX_PIECE_NAME) fail(`Name is over ${MAX_PIECE_NAME} characters.`);
    else if (CONTROL.test(name)) fail("Name has a line break or a control character.");
    else if (seen.has(name.toLowerCase())) fail(`This name is already on line ${seen.get(name.toLowerCase())}.`);
    else seen.set(name.toLowerCase(), line);

    const price = readMoney(cells[order.price], "Price", MIN_PRICE);
    if (price.error) fail(price.error);
    const cost = readMoney(cells[order.cost], "Cost", 0);
    if (cost.error) fail(cost.error);

    const leadRaw = cells[order.lead];
    const leadDays = /^\d{1,3}$/.test(leadRaw) ? Number(leadRaw) : Number.NaN;
    if (!leadRaw) fail("Lead days is empty.");
    else if (Number.isNaN(leadDays) || leadDays > MAX_LEAD_DAYS) {
      fail(`Lead days must be a whole number from 0 to ${MAX_LEAD_DAYS}.`);
    }

    if (errors.length > before || price.value === undefined || cost.value === undefined) return;
    // The row number keeps ids unique and clear of the demo's ids, which have no such suffix.
    parsed.push({ id: `${slug(name) || "item"}-${index + 1}`, name, price: price.value, cost: cost.value, leadDays, line });
  });

  return { rows: errors.length ? [] : parsed, errors, notes };
}

export type MerchantSetup = {
  name: string;
  city: string;
  depositRatio: number;
  minMargin: number;
  rows: SheetRow[];
  notes: RowProblem[];
};

export type SetupErrors = {
  name?: string;
  city?: string;
  depositPercent?: string;
  minMarginPercent?: string;
  catalog?: string;
  rows?: RowProblem[];
};

export type SetupCheck = { ok: true; setup: MerchantSetup } | { ok: false; errors: SetupErrors };

function readShopText(raw: unknown, label: string, isSensitive: Sensitive) {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return { error: `Enter the ${label}.` };
  if (text.length > MAX_SHOP_TEXT) return { error: `The ${label} is over ${MAX_SHOP_TEXT} characters.` };
  if (isSensitive(text)) return { error: SENSITIVE_MESSAGE };
  if (CONTROL.test(text)) return { error: `The ${label} has a line break or a control character.` };
  return { value: text };
}

function readPercent(raw: unknown, label: string, min: number, max: number) {
  const text = typeof raw === "string" ? raw.trim().replace(/%$/, "") : "";
  if (!/^\d{1,3}(?:\.\d)?$/.test(text)) return { error: `${label} must be a number from ${min} to ${max}.` };
  const value = Number(text);
  if (value < min || value > max) return { error: `${label} must be from ${min} to ${max}.` };
  return { value: value / 100 };
}

function byteLength(text: string) {
  return new TextEncoder().encode(text).length;
}

export function checkSetup(input: unknown, isSensitive: Sensitive = () => false): SetupCheck {
  const form = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const errors: SetupErrors = {};

  const name = readShopText(form.name, "shop name", isSensitive);
  if (name.error) errors.name = name.error;
  const city = readShopText(form.city, "city", isSensitive);
  if (city.error) errors.city = city.error;
  const deposit = readPercent(form.depositPercent, "Deposit", 1, 100);
  if (deposit.error) errors.depositPercent = deposit.error;
  const margin = readPercent(form.minMarginPercent, "Minimum margin", 0, 95);
  if (margin.error) errors.minMarginPercent = margin.error;

  const catalog = typeof form.catalog === "string" ? form.catalog : "";
  let sheet: Sheet = { rows: [], errors: [], notes: [] };
  if (byteLength(catalog) > MAX_CATALOG_BYTES) {
    errors.catalog = "The catalog is over 1 MB.";
  } else {
    sheet = parseCatalog(catalog, isSensitive);
    if (sheet.errors.length) {
      const lines = sheet.errors.flatMap((error) => (error.line ? [error.line] : []));
      const unique = [...new Set(lines)];
      const shown = unique.slice(0, 8).join(", ");
      const more = unique.length > 8 ? ` and ${unique.length - 8} more` : "";
      errors.catalog = unique.length
        ? `Fix line${unique.length > 1 ? "s" : ""} ${shown}${more}. Nothing was created.`
        : sheet.errors[0].message;
      if (unique.length) errors.rows = sheet.errors;
    }
  }

  if (Object.keys(errors).length || name.value === undefined || city.value === undefined) return { ok: false, errors };
  if (deposit.value === undefined || margin.value === undefined) return { ok: false, errors };

  const floor = margin.value;
  const notes = [...sheet.notes];
  for (const row of sheet.rows) {
    if ((row.price - row.cost) / row.price < floor) {
      notes.push({
        line: row.line,
        message: `${row.name} is under your ${Math.round(floor * 1000) / 10}% margin floor. Agents get a refusal on it.`,
      });
    }
  }
  return {
    ok: true,
    setup: { name: name.value, city: city.value, depositRatio: deposit.value, minMargin: floor, rows: sheet.rows, notes },
  };
}
