import { WEEK, initialEvents, initialLedger, initialTranscript, PIECES } from "@/lib/catalog";
import { money, moneyString, percent, usd } from "@/lib/format";
import { earliestDelivery, parseCeiling, POLICY, quotePiece } from "@/lib/policy";
import type {
  ActionResult,
  FloorEvent,
  Integration,
  LedgerRow,
  PayPalRecord,
  Piece,
  ShopSnapshot,
  TranscriptEntry,
} from "@/lib/types";
import { agentNamedIn, containsPan, type Gate } from "./agent-pay";
import { deployClerk } from "./astropods";
import { findComps } from "./channel3";
import { searchCatalog } from "./elastic";
import { confirmListing } from "./kernel";
import { contextSummary } from "./paypal/context";
import {
  authorizeOrder,
  captureAuthorization,
  createBalanceInvoice,
  createDepositOrder,
  paypalConfigured,
  paypalMode,
  refundCapture,
} from "./paypal/client";
import {
  bookRefund,
  rememberAuthorization,
  rememberCapture,
  rememberOrder,
  settle,
  sharedBook,
} from "./paypal/webhook";
import { currentVisitor } from "./visitor";
import { emitZapier } from "./zapier";

type Shop = ShopSnapshot;

const MAX_SHOPS = 500;

const globalStore = globalThis as unknown as { __marlowShops?: Map<string, Shop> };

function shops() {
  globalStore.__marlowShops ??= new Map();
  return globalStore.__marlowShops;
}

function integrations(): Integration[] {
  return [
    {
      name: "Mandate",
      state: "enforced",
      detail:
        "The buyer signs each mandate with its own Ed25519 key. The shop holds public keys only and checks the signature, expiry, nonce, and signed ceiling. A card number is refused. PayPal is the payment rail.",
    },
    {
      name: "OpenAI",
      state: process.env.OPENAI_API_KEY ? (process.env.OPENAI_MODEL || "gpt-4o-mini") : "rules",
      detail: "The shop agent and the books agent choose tools through the Vercel AI SDK. Policy sets every price.",
    },
    {
      name: "PayPal",
      state: paypalConfigured() ? "sandbox" : "rehearsal",
      detail: `Orders v2 authorize, Payments v2 capture and refund, Invoicing v2 for the balance.${
        process.env.PAYPAL_WEBHOOK_ID ? " Signed webhooks confirm each step." : ""
      }`,
    },
    {
      name: "API context",
      state: "loaded",
      detail: `Clerk may call only: ${contextSummary()}.`,
    },
    {
      name: "Elastic",
      state: process.env.ELASTIC_URL ? "configured" : "embedded",
      detail: "Catalog search. Embedded scoring unless ELASTIC_URL is set.",
    },
    {
      name: "Channel3",
      state: process.env.CHANNEL3_API_KEY ? "live" : "fixture",
      detail: "Market comps for the quote. Agentic search when a key is present.",
    },
    {
      name: "Bryntum",
      state: "floor",
      detail: "Thursday's mill stays held until a PayPal authorization replaces it.",
    },
    {
      name: "AG Studio",
      state: "books",
      detail: "A dashboard over the PayPal ledger that the merchant can redraw.",
    },
    {
      name: "Kernel",
      state: process.env.KERNEL_API_KEY ? "live" : "rehearsal",
      detail: "Opens the comparable listing before the quote goes out.",
    },
    {
      name: "Zapier",
      state: process.env.ZAPIER_HOOK_URL ? "hooked" : "ready",
      detail: "Departure notice when the deposit authorizes.",
    },
    {
      name: "Astropods",
      state: process.env.ASTROPODS_TOKEN ? "token" : "blueprint",
      detail: "astropods.yml is the clerk's deploy spec.",
    },
    {
      name: "Render",
      state: "blueprint",
      detail: "render.yaml runs the web app.",
    },
  ];
}

function seed(): Shop {
  return {
    version: 1,
    mode: paypalMode(),
    llm: Boolean(process.env.OPENAI_API_KEY),
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    paypalClientId: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || process.env.PAYPAL_CLIENT_ID || null,
    merchant: { name: "Field & Grain", place: "Austin", week: WEEK },
    phase: "idle",
    pieces: PIECES,
    events: initialEvents(),
    ledger: initialLedger(),
    transcript: initialTranscript(),
    quote: null,
    admission: null,
    paypal: null,
    comps: [],
    integrations: integrations(),
  };
}

function state() {
  const all = shops();
  const visitor = currentVisitor();
  const shop = all.get(visitor) ?? seed();
  // Re-insert so the oldest idle visitor is the first one evicted.
  all.delete(visitor);
  all.set(visitor, shop);
  if (all.size > MAX_SHOPS) {
    const oldest = all.keys().next().value;
    if (oldest) all.delete(oldest);
  }
  shop.mode = paypalMode();
  shop.llm = Boolean(process.env.OPENAI_API_KEY);
  shop.model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  shop.integrations = integrations();
  shop.paypalClientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || process.env.PAYPAL_CLIENT_ID || null;
  return shop;
}

function bump(shop: Shop) {
  shop.version += 1;
  shop.integrations = integrations();
}

function say(shop: Shop, entry: Omit<TranscriptEntry, "id">) {
  shop.transcript.push({ ...entry, id: `t-${shop.transcript.length + 1}-${shop.version}` });
}

function result(shop: Shop, before: number): ActionResult {
  return { shop, added: shop.transcript.length - before };
}

function fail(shop: Shop, before: number, text: string): ActionResult {
  say(shop, { role: "clerk", who: "Clerk", text });
  bump(shop);
  return result(shop, before);
}

export function getShop() {
  return state();
}

/** The shop a webhook belongs to. Never seeds one: a webhook has no visitor of its own. */
export function visitorShop(visitor: string) {
  return shops().get(visitor);
}

/** True when this key has a shop. Unlike getShop, it never creates one. */
export function hasShop() {
  return shops().has(currentVisitor());
}

export function dropShop() {
  shops().delete(currentVisitor());
}

export function resetShop(): ActionResult {
  shops().delete(currentVisitor());
  return { shop: state(), added: 0 };
}

function commitDesk(shop: Shop, orderId: string) {
  shop.events = shop.events.map((event) => {
    if (event.orderId !== "HIST-STOOL") return event;
    if (event.id === "stool-mill") {
      return { ...event, status: "released", name: "Stool: hold released" };
    }
    return { ...event, status: "released", name: "Stool: block lifted" };
  });
  const deskEvents: FloorEvent[] = [
    {
      id: "desk-mill",
      resourceId: "mill",
      name: "Writing desk: mill",
      start: "2026-10-08T08:00:00-05:00",
      end: "2026-10-08T18:00:00-05:00",
      status: "committed",
      orderId,
    },
    {
      id: "desk-finish",
      resourceId: "finish",
      name: "Desk: oil",
      start: "2026-10-08T12:00:00-05:00",
      end: "2026-10-08T18:00:00-05:00",
      status: "committed",
      orderId,
    },
    {
      id: "desk-van",
      resourceId: "van",
      name: "Desk: van",
      start: "2026-10-09T08:00:00-05:00",
      end: "2026-10-09T16:00:00-05:00",
      status: "committed",
      orderId,
    },
  ];
  shop.events = [...shop.events.filter((event) => !event.id.startsWith("desk-")), ...deskEvents];
}

function buyingIntent(message: string) {
  return /\b(buy|quote|order|want|ceiling|under|friday|deliver)\b/i.test(message) || /\bfor\s+[a-z]/i.test(message);
}

/** The answer for a message that arrived with no signed mandate at all. */
function noMandate(text: string): Gate {
  const named = agentNamedIn(text);
  return {
    ok: false,
    reason: named
      ? `This message names ${named}, but a name in text proves nothing. ${named} must present a mandate signed with its own key. Choose it under Buying as to sign one.`
      : "No signed mandate came with this request. Choose a registered buyer under Buying as, and PayPal can hold the deposit.",
  };
}

export async function consider(message: string, echo = true, gate?: Gate): Promise<ActionResult> {
  const shop = state();
  const before = shop.transcript.length;
  const text = message.trim();
  if (!text) return fail(shop, before, "Ask for a piece.");

  if (containsPan(text)) {
    if (echo) {
      say(shop, {
        role: "buyer",
        who: "You",
        text: text.replace(/\d(?:[ -]?\d){12,18}/g, "••••"),
      });
    }
    say(shop, {
      role: "trace",
      tool: "Mandate",
      ok: false,
      text: "A card number was presented. It was masked before it reached the log and never left the server.",
    });
    say(shop, {
      role: "trace",
      tool: "PayPal",
      ok: false,
      text: "PayPal stays closed. Nothing is held.",
    });
    say(shop, {
      role: "clerk",
      who: "Agent",
      text: "I don't take card numbers. To buy here, you need a registered agent with a signed mandate.",
    });
    bump(shop);
    return result(shop, before);
  }

  const q = text.toLowerCase();
  if (/(refund|scuff)/.test(q)) return refundScuff();
  if (/(capture|van is loaded|\bloaded\b)/.test(q)) return captureDeposit();
  if (/(authoriz|approve|hold the deposit)/.test(q)) return authorizeDeposit();

  const who = gate?.ok ? gate.admission.agentName : (gate?.claimedBy ?? "You");
  if (echo) say(shop, { role: "buyer", who, text });

  const found = await searchCatalog(shop.pieces, text);
  const hits = found.hits.map((hit) => hit.piece);
  if (!hits.length) {
    say(shop, { role: "clerk", who: "Agent", text: "Nothing in the shop matches that." });
    bump(shop);
    return result(shop, before);
  }

  const buying = buyingIntent(text) || (gate && !text.endsWith("?"));
  if (!buying) {
    const shown = hits.slice(0, 4);
    const list = shown.map((piece) => `${piece.name}, ${usd(piece.price)}`).join(". ");
    const prices = shown.map((piece) => piece.price);
    const range =
      shown.length === 1
        ? `${shown[0].name} at ${usd(prices[0])}`
        : `${shown.length} pieces, from ${usd(Math.min(...prices))} to ${usd(Math.max(...prices))}`;
    say(shop, { role: "trace", tool: found.engine === "elastic" ? "Elastic" : "Catalog", text: `${list}.` });
    say(shop, {
      role: "clerk",
      who: "Agent",
      text: `The shop has ${range}. Choose a registered buyer, like Juniper, Northwind, or Atelier, and I will quote one.`,
    });
    bump(shop);
    return result(shop, before);
  }

  if (shop.phase !== "idle") {
    return fail(shop, before, "A payment is already open. Reset the week to price something else.");
  }

  return offer(shop, before, hits[0], gate ?? noMandate(text), found.engine, text);
}

/** Prices one piece for one gate decision. Every term comes from the signed mandate. */
async function offer(shop: Shop, before: number, top: Piece, gate: Gate, engine: string, text = ""): Promise<ActionResult> {
  const signed = gate.ok ? gate.mandate : null;
  const ceiling = signed?.ceiling ?? top.price;
  const city = signed?.city ?? "Austin";
  const needBy = signed?.deliverBy ?? new Date(earliestDelivery(top)).toISOString();
  const decision = quotePiece(top, { ceiling, needBy });

  const spoken = parseCeiling(text);
  const ignored =
    signed && spoken !== null && spoken !== signed.ceiling
      ? ` The ${usd(spoken)} in the message changes nothing. The signed ceiling is ${usd(signed.ceiling)}.`
      : "";

  say(shop, {
    role: "trace",
    tool: engine === "elastic" ? "Elastic" : "Catalog",
    text: `${top.name}, ${usd(top.price)}.`,
  });

  let comps = shop.comps;
  if (top.id === "desk-walnut") {
    const market = await findComps("walnut writing desk under 900");
    comps = market.comps;
    const priced = comps.filter((comp) => comp.price > 0);
    if (priced.length) {
      const low = Math.min(...priced.map((comp) => comp.price));
      const high = Math.max(...priced.map((comp) => comp.price));
      say(shop, {
        role: "trace",
        tool: "Channel3",
        sample: !market.live,
        text: market.live
          ? `Market comps run ${usd(low)} to ${usd(high)}. The price stays at ${usd(top.price)}.`
          : `Sample comps, not a live search: ${usd(low)} to ${usd(high)}. The price stays at ${usd(top.price)}.`,
      });
    }
    say(shop, {
      role: "trace",
      tool: "Floor",
      text: "Thursday's mill is held for an unpaid stool. A PayPal hold on this order releases it.",
    });
    const browser = await confirmListing(priced[0]?.url, priced[0]?.title ?? "top comp");
    say(shop, {
      role: "trace",
      tool: "Kernel",
      sample: !browser.live,
      text: browser.note,
    });
  }

  say(shop, {
    role: "trace",
    tool: "Policy",
    ok: decision.ok,
    text: decision.ok
      ? `${decision.reason} ${percent(decision.margin)} margin, above the ${POLICY.minMargin * 100}% floor.`
      : decision.reason,
  });
  say(shop, {
    role: "trace",
    tool: "Mandate",
    ok: gate.ok,
    text: gate.ok ? `${gate.admission.reason}${ignored}` : gate.reason,
  });
  const cleared = decision.ok && gate.ok;
  say(shop, {
    role: "trace",
    tool: "PayPal",
    ok: cleared,
    text: cleared
      ? "Authorize the deposit only, for the amount policy signed."
      : "PayPal stays closed. Nothing is held.",
  });

  if (!decision.ok || !gate.ok) {
    const price = decision.ok
      ? `${top.name} is ${usd(decision.gross)}. A deposit would be ${usd(decision.deposit)}.`
      : top.price > ceiling
        ? `${decision.reason} Policy holds the price, so PayPal stays closed. The buyer needs a new signed mandate with a ceiling of ${usd(top.price)}, or can ask for another piece.${ignored}`
        : decision.reason;
    say(shop, {
      role: "clerk",
      who: "Agent",
      text: gate.ok ? price : `${gate.reason} ${price}`,
    });
    shop.comps = comps;
    bump(shop);
    return result(shop, before);
  }

  const buyer = gate.admission.agentName;
  shop.comps = comps;
  shop.admission = gate.admission;
  shop.quote = {
    pieceId: top.id,
    pieceName: top.name,
    buyer,
    city,
    gross: decision.gross,
    deposit: decision.deposit,
    balance: decision.balance,
    margin: decision.margin,
    ship: top.id === "desk-walnut" ? "Friday, Oct 9, before noon" : "Balance on delivery",
    ceiling,
  };
  shop.phase = "quoted";
  say(shop, {
    role: "clerk",
    who: "Agent",
    text: `${buyer} is admitted. PayPal can hold ${usd(decision.deposit)} on ${top.name}. ${usd(decision.balance)} is due on delivery.`,
  });
  bump(shop);
  return result(shop, before);
}

/**
 * The outside-agent path. It takes a catalog id, not free text, so nothing an
 * agent writes can reach the authorize, capture, or refund words in consider().
 */
export async function quoteForAgent(pieceId: string, gate: Gate & { ok: true }): Promise<ActionResult> {
  const shop = state();
  const piece = shop.pieces.find((item) => item.id === pieceId);
  if (!piece) return fail(shop, shop.transcript.length, `There is no piece with the id ${pieceId}.`);
  return offer(shop, shop.transcript.length, piece, gate, "catalog");
}

function rehearsalId(kind: string) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let body = "";
  for (let i = 0; i < 10; i += 1) body += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `RH-${kind}-${body}`;
}

export async function createPayPalOrder(): Promise<ActionResult & { orderId?: string }> {
  const shop = state();
  const before = shop.transcript.length;
  if (!shop.quote || shop.phase !== "quoted") {
    return { ...fail(shop, before, "There is no open quote to authorize."), orderId: undefined };
  }
  if (!paypalConfigured()) {
    const orderId = rehearsalId("ORDER");
    shop.paypal = { mode: "rehearsal", orderId, status: "CREATED" };
    bump(shop);
    return { ...result(shop, before), orderId };
  }
  try {
    const created = await createDepositOrder({
      amount: shop.quote.deposit,
      description: `${shop.quote.pieceName} deposit`,
      customId: shop.quote.pieceId,
    });
    shop.paypal = { mode: "live", orderId: created.orderId, status: created.status };
    rememberOrder(sharedBook(), currentVisitor(), created.orderId);
    bump(shop);
    return { ...result(shop, before), orderId: created.orderId };
  } catch (error) {
    return {
      ...fail(shop, before, error instanceof Error ? error.message : "PayPal could not create the order."),
      orderId: undefined,
    };
  }
}

async function afterAuthorization(shop: Shop, paypal: PayPalRecord) {
  if (!shop.quote) return;
  const quote = shop.quote;
  shop.paypal = paypal;
  shop.phase = "authorized";
  if (quote.pieceId === "desk-walnut") commitDesk(shop, paypal.orderId);
  const row: LedgerRow = {
    id: `led-${paypal.orderId}`,
    at: new Date().toISOString(),
    agent: quote.buyer,
    piece: quote.pieceName,
    city: quote.city,
    gross: quote.gross,
    deposit: quote.deposit,
    captured: 0,
    refunded: 0,
    margin: quote.margin,
    status: "Authorized",
    paypalOrderId: paypal.orderId,
  };
  shop.ledger = [row, ...shop.ledger.filter((item) => item.id !== row.id)];

  let invoiceNote = "Balance invoice rehearsed.";
  if (paypal.mode === "live") {
    try {
      const invoice = await createBalanceInvoice({
        amount: quote.balance,
        piece: quote.pieceName,
        buyer: quote.buyer,
      });
      paypal.invoiceId = invoice.invoiceId;
      invoiceNote = `Balance invoice ${invoice.invoiceId} created for ${usd(quote.balance)}.`;
    } catch {
      invoiceNote = `The ${usd(quote.balance)} balance stays due on delivery.`;
    }
  } else {
    paypal.invoiceId = rehearsalId("INV");
    invoiceNote = `Balance invoice ${paypal.invoiceId} rehearsed for ${usd(quote.balance)}, due on delivery.`;
  }

  const hook = await emitZapier({
    event: "paypal.deposit.authorized",
    merchant: "Field & Grain",
    agent: quote.buyer,
    piece: quote.pieceName,
    amount: moneyString(quote.deposit),
    currency: "USD",
    paypalOrderId: paypal.orderId,
    shipDate: "2026-10-09",
  });

  const moved =
    quote.pieceId === "desk-walnut"
      ? "The stool is off Thursday. The desk now has the mill, the finish bench, and Friday's van."
      : `${quote.pieceName} is held for ${quote.buyer}.`;
  say(shop, {
    role: "clerk",
    who: "Agent",
    text: `PayPal is holding the deposit. ${moved} ${invoiceNote}`,
  });
  say(shop, {
    role: "trace",
    tool: "Zapier",
    text: hook.delivered
      ? "Zapier accepted the departure notice."
      : `Departure notice is ready. ${quote.buyer}, ${usd(quote.deposit)}.`,
  });
}

export async function authorizeDeposit(orderId?: string): Promise<ActionResult> {
  const shop = state();
  const before = shop.transcript.length;
  if (!shop.quote || (shop.phase !== "quoted" && shop.phase !== "idle")) {
    if (shop.phase !== "quoted") {
      return fail(shop, before, "Authorize is only open while the quote is waiting.");
    }
  }
  if (shop.phase !== "quoted" || !shop.quote) {
    return fail(shop, before, "Get the quote before authorizing.");
  }

  if (!paypalConfigured()) {
    const paypal: PayPalRecord = {
      mode: "rehearsal",
      orderId: orderId || shop.paypal?.orderId || rehearsalId("ORDER"),
      authorizationId: rehearsalId("AUTH"),
      status: "AUTHORIZED",
    };
    await afterAuthorization(shop, paypal);
    bump(shop);
    return result(shop, before);
  }

  try {
    const id = orderId || shop.paypal?.orderId;
    if (!id) return fail(shop, before, "The PayPal button has to create the order before approval.");
    const authorized = await authorizeOrder(id);
    const book = sharedBook();
    rememberOrder(book, currentVisitor(), id);
    rememberAuthorization(book, id, authorized.authorizationId);
    await afterAuthorization(shop, {
      mode: "live",
      orderId: id,
      authorizationId: authorized.authorizationId,
      status: authorized.status,
    });
    settle(book, shop);
    bump(shop);
    return result(shop, before);
  } catch (error) {
    return fail(shop, before, error instanceof Error ? error.message : "Authorization failed.");
  }
}

export async function captureDeposit(): Promise<ActionResult> {
  const shop = state();
  const before = shop.transcript.length;
  if (shop.phase !== "authorized" || !shop.paypal?.authorizationId || !shop.quote) {
    return fail(shop, before, "Nothing is authorized to capture.");
  }
  const amount = shop.quote.deposit;
  try {
    if (shop.paypal.mode === "live") {
      const captured = await captureAuthorization(shop.paypal.authorizationId, amount);
      shop.paypal.captureId = captured.captureId;
      shop.paypal.status = captured.status ?? "COMPLETED";
      rememberCapture(sharedBook(), shop.paypal.orderId, captured.captureId, shop.paypal.status, amount);
    } else {
      shop.paypal.captureId = rehearsalId("CAP");
      shop.paypal.status = "COMPLETED";
    }
    shop.phase = "captured";
    shop.ledger = shop.ledger.map((row) =>
      row.paypalOrderId === shop.paypal?.orderId
        ? { ...row, captured: amount, status: "Captured" }
        : row,
    );
    say(shop, {
      role: "clerk",
      who: "Clerk",
      text:
        shop.quote.pieceId === "desk-walnut"
          ? `The van is loaded. PayPal captured the ${usd(amount)} deposit. The balance stays on the invoice.`
          : `PayPal captured the ${usd(amount)} deposit. The balance stays on the invoice.`,
    });
    settle(sharedBook(), shop);
    bump(shop);
    return result(shop, before);
  } catch (error) {
    return fail(shop, before, error instanceof Error ? error.message : "Capture failed.");
  }
}

export async function refundScuff(): Promise<ActionResult> {
  const shop = state();
  const before = shop.transcript.length;
  const amount = 80;
  if ((shop.phase !== "captured" && shop.phase !== "refunded") || !shop.paypal?.captureId || !shop.quote) {
    return fail(shop, before, "A refund needs a captured payment. The unpaid stool cannot be refunded.");
  }
  if (shop.phase === "refunded") {
    return fail(shop, before, "The scuff refund is already on the books.");
  }
  try {
    if (shop.paypal.mode === "live") {
      const refunded = await refundCapture(shop.paypal.captureId, amount);
      shop.paypal.refundId = refunded.refundId;
      shop.paypal.status = refunded.status ?? "REFUNDED";
    } else {
      shop.paypal.refundId = rehearsalId("REF");
      shop.paypal.status = "PARTIALLY_REFUNDED";
    }
    bookRefund(shop, shop.paypal.refundId, amount);
    say(shop, {
      role: "clerk",
      who: "Clerk",
      text:
        shop.quote.pieceId === "desk-walnut"
          ? `The top has a scuff. ${usd(amount)} goes back on refund ${shop.paypal.refundId}. The desk still ships Friday.`
          : `${usd(amount)} goes back on refund ${shop.paypal.refundId}. The order still stands.`,
    });
    settle(sharedBook(), shop);
    bump(shop);
    return result(shop, before);
  } catch (error) {
    return fail(shop, before, error instanceof Error ? error.message : "Refund failed.");
  }
}

export async function searchPieces(query: string) {
  const shop = state();
  const found = await searchCatalog(shop.pieces, query);
  return { engine: found.engine, note: found.note, pieces: found.hits.map((hit) => hit.piece) };
}

/** Catalog search with no shop behind it, and no cost or margin in the answer. */
export async function searchForAgent(query: string) {
  const found = await searchCatalog(PIECES, query);
  return found.hits.map(({ piece: { id, name, wood, size, price, leadDays, blurb } }) => ({
    id,
    name,
    wood,
    size,
    price,
    leadDays,
    blurb,
  }));
}

export async function sweepHolds(): Promise<ActionResult> {
  const shop = state();
  const before = shop.transcript.length;
  const now = Date.now();
  let released = 0;
  shop.events = shop.events.map((event) => {
    if ((event.status === "held" || event.status === "blocked") && new Date(event.end).getTime() < now) {
      released += 1;
      return { ...event, status: "released", name: event.name.replace("hold, unpaid", "released").replace("blocked", "released") };
    }
    return event;
  });
  if (released) {
    say(shop, {
      role: "note",
      text: `Sweep released ${released} unpaid hold${released === 1 ? "" : "s"}.`,
    });
  }
  bump(shop);
  return result(shop, before);
}

export async function deploy() {
  return deployClerk();
}

export function sampleHook() {
  return {
    event: "paypal.deposit.authorized",
    merchant: "Field & Grain",
    agent: "Juniper",
    piece: "Writing desk, walnut",
    amount: "336.00",
    currency: "USD",
    paypalOrderId: "RH-ORDER-EXAMPLE",
    shipDate: "2026-10-09",
  };
}
