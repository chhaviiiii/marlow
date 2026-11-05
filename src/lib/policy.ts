import type { ShopPolicy } from "./types";

function money(n: number) {
  return Math.round(n * 100) / 100;
}

function dollars(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type PricedPiece = {
  id: string;
  name: string;
  price: number;
  cost: number;
  leadDays: number;
};

/** The maker's rule. The model may propose. Only this function may price. */
export const POLICY: ShopPolicy = {
  depositRatio: 0.4,
  minMargin: 0.08,
  captureOn: "ship",
  currency: "USD",
};

/** The shop's calendar is this frozen demo week, not the wall clock. */
const WEEK_START = "2026-10-05T08:00:00-05:00";
const DAY_MS = 24 * 60 * 60 * 1000;
/** Friday's van, once a PayPal hold gives the desk Thursday's mill. */
const PROMISED: Record<string, string> = { "desk-walnut": "2026-10-09T12:00:00-05:00" };

export function earliestDelivery(piece: PricedPiece, policy: ShopPolicy = POLICY, now = Date.now()) {
  if (policy.calendar === "live") return now + piece.leadDays * DAY_MS;
  const promised = PROMISED[piece.id];
  return promised ? Date.parse(promised) : Date.parse(WEEK_START) + piece.leadDays * DAY_MS;
}

function day(ms: number) {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" });
}

export type QuoteRequest = {
  ceiling: number;
  needBy: string;
};

export type QuoteDecision =
  | {
      ok: true;
      gross: number;
      deposit: number;
      balance: number;
      margin: number;
      reason: string;
    }
  | { ok: false; reason: string };

const DOLLARS = /\$\s*(\d[\d,]*(?:\.\d{1,2})?)/;
const BARE_LIMIT =
  /\b(?:over|under|ceiling(?:\s+of)?|budget(?:\s+(?:of|is))?|max(?:imum)?(?:\s+of)?|limit(?:\s+of)?|up to|at most|no more than)\s*:?\s*(\d[\d,]*(?:\.\d{1,2})?)(?![\d,]*\s*(?:ft|feet|foot|in|inch|inches|cm|mm|lbs?|kg|days?|weeks?|people|seats)\b)/i;

/** The buyer's limit, written with a dollar sign or as a bare number after a limit word. */
export function parseCeiling(message: string) {
  const match = message.match(DOLLARS) ?? message.match(BARE_LIMIT);
  return match ? Number(match[1].replace(/,/g, "")) : null;
}

const asPercent = (ratio: number) => Math.round(ratio * 1000) / 10;

/** Pass a merchant's policy to price for that merchant. The default is the demo shop's. */
export function quotePiece(
  piece: PricedPiece,
  request: QuoteRequest,
  policy: ShopPolicy = POLICY,
  now = Date.now(),
): QuoteDecision {
  const margin = (piece.price - piece.cost) / piece.price;
  if (piece.price > request.ceiling) {
    return {
      ok: false,
      reason: `${piece.name} is ${dollars(piece.price)}, above the buyer's ceiling of ${dollars(request.ceiling)}.`,
    };
  }
  const arrives = earliestDelivery(piece, policy, now);
  if (arrives > Date.parse(request.needBy)) {
    return {
      ok: false,
      reason: `${piece.name} cannot arrive before ${day(arrives)}, after the buyer's signed deadline of ${day(Date.parse(request.needBy))}.`,
    };
  }
  if (margin < policy.minMargin) {
    return {
      ok: false,
      reason: `Margin would be under the ${asPercent(policy.minMargin)}% floor.`,
    };
  }
  const deposit = money(piece.price * policy.depositRatio);
  const balance = money(piece.price - deposit);
  return {
    ok: true,
    gross: piece.price,
    deposit,
    balance,
    margin,
    reason: `Deposit ${asPercent(policy.depositRatio)}%. Margin holds. Capture on ${policy.captureOn}.`,
  };
}
