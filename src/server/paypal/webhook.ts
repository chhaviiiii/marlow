import type { ShopSnapshot } from "../../lib/types";

/**
 * PayPal's word on each payment, delivered without a cookie.
 *
 * Every id PayPal may name is indexed back to its order, and each order to the
 * visitor whose shop opened it. A trail keeps what PayPal has said as facts,
 * not as a sequence, and the shop is projected from those facts. So the order
 * of delivery does not change the result, and a repeat changes nothing.
 *
 * This file has no `@/` imports so `node --test` can run it.
 */

export type WebhookShop = Pick<ShopSnapshot, "version" | "phase" | "events" | "ledger" | "transcript" | "paypal">;

type Drop = "VOIDED" | "DENIED";

export type Trail = {
  visitor: string;
  orderId: string;
  authorizationId?: string;
  captureId?: string;
  held: boolean;
  dropped: Drop | null;
  /** The amount in PAYMENT.CAPTURE.COMPLETED. */
  captured: number | null;
  /** The amount from our own capture call when PayPal answered COMPLETED. */
  capturedByCall: number | null;
  refunds: Record<string, number>;
  last?: { event: string; at: string };
};

type Kind = "held" | "voided" | "captured" | "denied" | "refunded";

type PaymentEvent = {
  kind: Kind;
  type: string;
  at: string;
  resourceId: string;
  amount: number | null;
  refs: string[];
};

export type Book = {
  trails: Map<string, Trail>;
  /** Authorization, capture, and order ids to order id. */
  index: Map<string, string>;
  seen: Set<string>;
  /** Events that named no id we know yet, such as a refund ahead of its capture. */
  parked: PaymentEvent[];
};

const MAX_TRAILS = 1000;
const MAX_SEEN = 5000;
const MAX_PARKED = 100;

const KINDS: Record<string, Kind> = {
  "PAYMENT.AUTHORIZATION.CREATED": "held",
  "PAYMENT.AUTHORIZATION.VOIDED": "voided",
  "PAYMENT.CAPTURE.COMPLETED": "captured",
  "PAYMENT.CAPTURE.DENIED": "denied",
  // PayPal's Payments v2 event list uses this name for the same outcome.
  "PAYMENT.CAPTURE.DECLINED": "denied",
  "PAYMENT.CAPTURE.REFUNDED": "refunded",
};

export function newBook(): Book {
  return { trails: new Map(), index: new Map(), seen: new Set(), parked: [] };
}

const globalStore = globalThis as unknown as { __marlowPayPalBook?: Book };

/** Next can load a module once per route, so the book lives on globalThis like the shops. */
export function sharedBook() {
  globalStore.__marlowPayPalBook ??= newBook();
  return globalStore.__marlowPayPalBook;
}

export function rememberOrder(book: Book, visitor: string, orderId: string) {
  if (book.trails.has(orderId)) return;
  book.trails.set(orderId, {
    visitor,
    orderId,
    held: false,
    dropped: null,
    captured: null,
    capturedByCall: null,
    refunds: {},
  });
  book.index.set(orderId, orderId);
  if (book.trails.size > MAX_TRAILS) {
    const oldest = book.trails.keys().next().value;
    if (!oldest) return;
    book.trails.delete(oldest);
    for (const [id, order] of book.index) {
      if (order === oldest) book.index.delete(id);
    }
  }
}

export function rememberAuthorization(book: Book, orderId: string, authorizationId: string) {
  const trail = book.trails.get(orderId);
  if (!trail) return;
  trail.authorizationId = authorizationId;
  book.index.set(authorizationId, orderId);
}

/** Our capture call returned. A COMPLETED answer is a fact that a late void or denial cannot undo. */
export function rememberCapture(book: Book, orderId: string, captureId: string, status: string, amount: number) {
  const trail = book.trails.get(orderId);
  if (!trail) return;
  trail.captureId = captureId;
  book.index.set(captureId, orderId);
  if (status === "COMPLETED") trail.capturedByCall = amount;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function text(value: unknown) {
  return typeof value === "string" && value ? value : undefined;
}

function upId(links: unknown) {
  if (!Array.isArray(links)) return undefined;
  const href = text(record(links.find((link) => record(link).rel === "up")).href);
  return href?.split("?")[0].split("/").filter(Boolean).at(-1);
}

function readEvent(raw: Record<string, unknown>): PaymentEvent | null {
  const type = text(raw.event_type);
  const kind = type ? KINDS[type] : undefined;
  const resource = record(raw.resource);
  const resourceId = text(resource.id);
  if (!type || !kind || !resourceId) return null;
  const related = record(record(resource.supplementary_data).related_ids);
  const value = Number(record(resource.amount).value);
  const refs = [
    text(related.order_id),
    text(related.authorization_id),
    text(related.capture_id),
    upId(resource.links),
    resourceId,
  ].filter((ref): ref is string => Boolean(ref));
  return {
    kind,
    type,
    at: text(raw.create_time) ?? new Date().toISOString(),
    resourceId,
    amount: Number.isFinite(value) && value > 0 ? value : null,
    refs,
  };
}

function findTrail(book: Book, refs: string[]) {
  for (const ref of refs) {
    const orderId = book.index.get(ref);
    if (orderId) return book.trails.get(orderId);
  }
  return undefined;
}

function learn(book: Book, trail: Trail, event: PaymentEvent) {
  for (const ref of event.refs) book.index.set(ref, trail.orderId);
  trail.last = { event: event.type, at: event.at };
  switch (event.kind) {
    case "held":
      trail.held = true;
      trail.authorizationId = event.resourceId;
      break;
    case "voided":
      trail.dropped = "VOIDED";
      trail.authorizationId = event.resourceId;
      break;
    case "captured":
      trail.captured = event.amount ?? trail.captured ?? 0;
      trail.captureId = event.resourceId;
      break;
    case "denied":
      trail.dropped ??= "DENIED";
      break;
    case "refunded":
      trail.refunds[event.resourceId] = event.amount ?? 0;
      break;
  }
}

function say(shop: WebhookShop, role: "clerk" | "note", line: string) {
  shop.transcript.push({
    id: `t-${shop.transcript.length + 1}-${shop.version}`,
    role,
    ...(role === "clerk" ? { who: "Clerk" } : {}),
    text: line,
  });
}

/** Books one refund on the shop, once per PayPal refund id, whichever side reports it first. */
export function bookRefund(shop: WebhookShop, refundId: string, amount: number) {
  const paypal = shop.paypal;
  if (!paypal) return false;
  paypal.refunds ??= {};
  if (refundId in paypal.refunds) return false;
  paypal.refunds[refundId] = amount;
  paypal.refundId = refundId;
  shop.phase = "refunded";
  shop.ledger = shop.ledger.map((row) => {
    if (row.paypalOrderId !== paypal.orderId) return row;
    const refunded = Math.round((row.refunded + amount) * 100) / 100;
    const netBefore = row.gross - row.refunded;
    const net = row.gross - refunded;
    const cost = netBefore * (1 - row.margin);
    return {
      ...row,
      refunded,
      status: refunded >= row.captured ? "Refunded" : "Partial refund",
      margin: net <= 0 ? 0 : (net - cost) / net,
    };
  });
  return true;
}

function releaseFloor(shop: WebhookShop, orderId: string) {
  let released = 0;
  shop.events = shop.events.map((event) => {
    if (event.orderId !== orderId || event.status === "released") return event;
    released += 1;
    return { ...event, status: "released", name: `${event.name}, released` };
  });
  return released;
}

function restoreFloor(shop: WebhookShop, orderId: string) {
  shop.events = shop.events.map((event) =>
    event.orderId === orderId && event.status === "released"
      ? { ...event, status: "committed", name: event.name.replace(/, released$/, "") }
      : event,
  );
}

function dropHold(shop: WebhookShop, trail: Trail, drop: Drop) {
  const paypal = shop.paypal;
  if (!paypal || paypal.released) return;
  const released = releaseFloor(shop, trail.orderId);
  paypal.released = true;
  paypal.status = drop;
  paypal.captureId = undefined;
  // The quote stands, so the buyer can open a new hold.
  shop.phase = "quoted";
  shop.ledger = shop.ledger.map((row) =>
    row.paypalOrderId === trail.orderId
      ? { ...row, captured: 0, status: drop === "VOIDED" ? "Voided" : "Denied" }
      : row,
  );
  const what = drop === "VOIDED" ? "PayPal voided the hold." : "PayPal denied the capture.";
  say(shop, "clerk", released ? `${what} The floor released the desk.` : `${what} Nothing is held now.`);
}

function confirmation(trail: Trail) {
  if (Object.keys(trail.refunds).length) return "refund completed";
  if (trail.captured !== null) return "capture completed";
  if (trail.dropped) return trail.dropped === "VOIDED" ? "hold voided" : "capture denied";
  return trail.held ? "hold placed" : null;
}

/**
 * Brings a shop in line with what PayPal has said. It is safe to run again at
 * any time, so the button routes call it too: a webhook can arrive while
 * their PayPal call is still open.
 */
export function project(shop: WebhookShop, trail: Trail) {
  const paypal = shop.paypal;
  if (!paypal || paypal.orderId !== trail.orderId) return false;
  if (trail.authorizationId) paypal.authorizationId ??= trail.authorizationId;

  const refunds = Object.entries(trail.refunds);
  const captured = trail.captured !== null || trail.capturedByCall !== null || refunds.length > 0;
  // A quoted shop has not opened this hold yet, unless PayPal already dropped it.
  const live = shop.phase !== "quoted" || paypal.released;

  if (captured && live) {
    if (paypal.released) {
      restoreFloor(shop, trail.orderId);
      paypal.released = false;
    }
    if (trail.captureId) paypal.captureId ??= trail.captureId;
    if (shop.phase === "quoted" || shop.phase === "authorized") {
      const amount = trail.captured || trail.capturedByCall;
      shop.phase = "captured";
      paypal.status = "COMPLETED";
      shop.ledger = shop.ledger.map((row) =>
        row.paypalOrderId === trail.orderId
          ? { ...row, captured: amount || row.deposit, status: "Captured" }
          : row,
      );
      say(shop, "note", "PayPal reports the deposit captured.");
    } else if (trail.captured !== null && shop.phase === "captured") {
      paypal.status = "COMPLETED";
    }
    for (const [refundId, amount] of refunds) {
      if (bookRefund(shop, refundId, amount)) {
        const row = shop.ledger.find((item) => item.paypalOrderId === trail.orderId);
        paypal.status = row && row.refunded >= row.captured ? "REFUNDED" : "PARTIALLY_REFUNDED";
        say(shop, "note", `PayPal reports refund ${refundId}.`);
      }
    }
  } else if (!captured && trail.dropped && shop.phase !== "quoted") {
    dropHold(shop, trail, trail.dropped);
  }

  const confirmed = confirmation(trail);
  if (confirmed && trail.last) {
    paypal.webhook = { ...trail.last, note: `Confirmed by PayPal webhook: ${confirmed}.` };
  }
  return true;
}

/** For the button routes, once their own PayPal call has returned. */
export function settle(book: Book, shop: WebhookShop) {
  const trail = shop.paypal ? book.trails.get(shop.paypal.orderId) : undefined;
  if (!trail) return;
  // The call may have taught us the id a parked event was waiting for.
  for (const event of [...book.parked]) {
    if (findTrail(book, event.refs) !== trail) continue;
    book.parked.splice(book.parked.indexOf(event), 1);
    learn(book, trail, event);
  }
  project(shop, trail);
}

type ShopFor = (visitor: string) => WebhookShop | undefined;

function apply(book: Book, event: PaymentEvent, shopFor: ShopFor) {
  const trail = findTrail(book, event.refs);
  if (!trail) return "unknown order";
  learn(book, trail, event);
  const shop = shopFor(trail.visitor);
  if (!shop || !project(shop, trail)) return "stale order";
  shop.version += 1;
  return null;
}

function replayParked(book: Book, shopFor: ShopFor) {
  for (let moved = true; moved; ) {
    moved = false;
    for (const event of [...book.parked]) {
      if (!findTrail(book, event.refs)) continue;
      book.parked.splice(book.parked.indexOf(event), 1);
      apply(book, event, shopFor);
      moved = true;
    }
  }
}

const TRANSMISSION_HEADERS = {
  transmission_id: "paypal-transmission-id",
  transmission_time: "paypal-transmission-time",
  cert_url: "paypal-cert-url",
  auth_algo: "paypal-auth-algo",
  transmission_sig: "paypal-transmission-sig",
} as const;

/**
 * The body for verify-webhook-signature. PayPal signs the bytes it sent, so
 * `webhook_event` is the raw request body. Parsing and re-serializing it can
 * fail verification. Only call this with a body that parses as a JSON object.
 */
export function verificationBody(rawBody: string, transmission: Record<string, string>, webhookId: string) {
  const fields = JSON.stringify({ ...transmission, webhook_id: webhookId });
  return `${fields.slice(0, -1)},"webhook_event":${rawBody}}`;
}

export type WebhookRequest = {
  rawBody: string;
  headers: { get(name: string): string | null };
  webhookId: string | undefined;
  /** Null when the PayPal credentials are missing. Throws when PayPal cannot answer. */
  verify: ((body: string) => Promise<boolean>) | null;
  book: Book;
  shopFor: ShopFor;
};

export type WebhookResponse = {
  status: number;
  body: { received: true; applied?: string; ignored?: string } | { error: string };
};

export async function handleWebhookRequest(request: WebhookRequest): Promise<WebhookResponse> {
  const { rawBody, headers, webhookId, verify, book, shopFor } = request;
  if (!webhookId) return { status: 503, body: { error: "PAYPAL_WEBHOOK_ID is not set. Nothing was changed." } };
  if (!verify) return { status: 503, body: { error: "PayPal credentials are not set. Nothing was changed." } };

  const transmission: Record<string, string> = {};
  for (const [field, header] of Object.entries(TRANSMISSION_HEADERS)) {
    const value = headers.get(header);
    if (!value) return { status: 400, body: { error: `Missing ${header}.` } };
    transmission[field] = value;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { error: "The body is not JSON." } };
  }
  const raw = record(parsed);
  const id = text(raw.id);
  if (Array.isArray(parsed) || !id) return { status: 400, body: { error: "The body is not a webhook event." } };

  let verified: boolean;
  try {
    verified = await verify(verificationBody(rawBody, transmission, webhookId));
  } catch {
    // A non-2xx answer makes PayPal send the event again later.
    return { status: 502, body: { error: "PayPal could not verify this event. Nothing was changed." } };
  }
  if (!verified) return { status: 400, body: { error: "The signature did not verify. Nothing was changed." } };

  if (book.seen.has(id)) return { status: 200, body: { received: true, ignored: "duplicate" } };
  book.seen.add(id);
  if (book.seen.size > MAX_SEEN) {
    const oldest = book.seen.values().next().value;
    if (oldest) book.seen.delete(oldest);
  }

  // Verified events always get a 2xx. Anything else makes PayPal retry for three days.
  const event = readEvent(raw);
  if (!event) return { status: 200, body: { received: true, ignored: "unhandled event" } };
  const ignored = apply(book, event, shopFor);
  if (ignored === "unknown order") {
    book.parked.push(event);
    if (book.parked.length > MAX_PARKED) book.parked.shift();
    return { status: 200, body: { received: true, ignored } };
  }
  if (ignored) return { status: 200, body: { received: true, ignored } };
  replayParked(book, shopFor);
  return { status: 200, body: { received: true, applied: event.type } };
}
