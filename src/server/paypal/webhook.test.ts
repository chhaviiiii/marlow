import assert from "node:assert/strict";
import test from "node:test";
import {
  bookRefund,
  handleWebhookRequest,
  newBook,
  rememberAuthorization,
  rememberCapture,
  rememberOrder,
  settle,
  verificationBody,
  type Book,
  type WebhookShop,
} from "./webhook.ts";

const ORDER = "5O190127TN364715T";
const AUTH = "0VF52814937998046";
const CAPTURE = "3C679366HH908993F";
const REFUND = "4D780477II019004G";
const VISITOR = "visitor-a";

const HEADERS: Record<string, string> = {
  "paypal-transmission-id": "tx-1",
  "paypal-transmission-time": "2026-10-08T12:00:00Z",
  "paypal-cert-url": "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-1",
  "paypal-auth-algo": "SHA256withRSA",
  "paypal-transmission-sig": "c2lnbmF0dXJl",
};

function deskShop(phase: WebhookShop["phase"] = "authorized"): WebhookShop {
  return {
    version: 1,
    phase,
    transcript: [],
    paypal: { mode: "live", orderId: ORDER, authorizationId: AUTH, status: "CREATED" },
    events: [
      { id: "stool-mill", resourceId: "mill", name: "Stool: hold released", start: "a", end: "b", status: "released", orderId: "HIST-STOOL" },
      { id: "desk-mill", resourceId: "mill", name: "Writing desk: mill", start: "a", end: "b", status: "committed", orderId: ORDER },
      { id: "desk-van", resourceId: "van", name: "Desk: van", start: "a", end: "b", status: "committed", orderId: ORDER },
    ],
    ledger: [
      {
        id: `led-${ORDER}`,
        at: "2026-10-08T12:00:00Z",
        agent: "Juniper",
        piece: "Writing desk, walnut",
        city: "Austin",
        gross: 840,
        deposit: 336,
        captured: 0,
        refunded: 0,
        margin: 0.5,
        status: "Authorized",
        paypalOrderId: ORDER,
      },
    ],
  };
}

function setup(shop = deskShop()) {
  const book = newBook();
  rememberOrder(book, VISITOR, ORDER);
  rememberAuthorization(book, ORDER, AUTH);
  return { book, shop };
}

type Event = { id: string; event_type: string; create_time: string; resource: Record<string, unknown> };

function held(id = "WH-held"): Event {
  return {
    id,
    event_type: "PAYMENT.AUTHORIZATION.CREATED",
    create_time: "2026-10-08T12:00:01Z",
    resource: {
      id: AUTH,
      status: "CREATED",
      amount: { value: "336.00", currency_code: "USD" },
      supplementary_data: { related_ids: { order_id: ORDER } },
    },
  };
}

function voided(id = "WH-void"): Event {
  return {
    id,
    event_type: "PAYMENT.AUTHORIZATION.VOIDED",
    create_time: "2026-10-08T12:00:02Z",
    resource: {
      id: AUTH,
      status: "VOIDED",
      links: [{ rel: "up", href: `https://api.sandbox.paypal.com/v2/checkout/orders/${ORDER}` }],
    },
  };
}

function captured(id = "WH-capture"): Event {
  return {
    id,
    event_type: "PAYMENT.CAPTURE.COMPLETED",
    create_time: "2026-10-08T12:00:03Z",
    resource: {
      id: CAPTURE,
      status: "COMPLETED",
      amount: { value: "336.00", currency_code: "USD" },
      supplementary_data: { related_ids: { order_id: ORDER, authorization_id: AUTH } },
    },
  };
}

function denied(eventType = "PAYMENT.CAPTURE.DENIED", id = "WH-denied"): Event {
  return {
    id,
    event_type: eventType,
    create_time: "2026-10-08T12:00:03Z",
    resource: {
      id: CAPTURE,
      status: "DECLINED",
      links: [{ rel: "up", href: `https://api.sandbox.paypal.com/v2/payments/authorizations/${AUTH}` }],
    },
  };
}

function refunded(id = "WH-refund", refundId = REFUND, value = "80.00"): Event {
  return {
    id,
    event_type: "PAYMENT.CAPTURE.REFUNDED",
    create_time: "2026-10-08T12:00:04Z",
    resource: {
      id: refundId,
      status: "COMPLETED",
      amount: { value, currency_code: "USD" },
      links: [
        { rel: "self", href: `https://api.sandbox.paypal.com/v2/payments/refunds/${refundId}` },
        { rel: "up", href: `https://api.sandbox.paypal.com/v2/payments/captures/${CAPTURE}` },
      ],
    },
  };
}

function deliver(book: Book, shop: WebhookShop | undefined, event: unknown, overrides: { verify?: ((body: string) => Promise<boolean>) | null; webhookId?: string; headers?: Record<string, string> } = {}) {
  return handleWebhookRequest({
    rawBody: typeof event === "string" ? event : JSON.stringify(event),
    headers: new Headers(overrides.headers ?? HEADERS),
    webhookId: "webhookId" in overrides ? overrides.webhookId : "WH-ID-1",
    verify: "verify" in overrides ? (overrides.verify ?? null) : async () => true,
    book,
    shopFor: (visitor) => (visitor === VISITOR ? shop : undefined),
  });
}

test("with no PAYPAL_WEBHOOK_ID the route answers 503 and changes nothing", async () => {
  const { book, shop } = setup();
  const before = structuredClone(shop);
  let asked = false;
  const response = await deliver(book, shop, voided(), {
    webhookId: undefined,
    verify: async () => {
      asked = true;
      return true;
    },
  });
  assert.equal(response.status, 503);
  assert.match(JSON.stringify(response.body), /PAYPAL_WEBHOOK_ID/);
  assert.equal(asked, false);
  assert.deepEqual(shop, before);
});

test("with no PayPal credentials the route answers 503", async () => {
  const { book, shop } = setup();
  const response = await deliver(book, shop, voided(), { verify: null });
  assert.equal(response.status, 503);
});

test("a forged signature is refused and changes nothing", async () => {
  const { book, shop } = setup();
  const before = structuredClone(shop);
  const response = await deliver(book, shop, voided(), { verify: async () => false });
  assert.equal(response.status, 400);
  assert.deepEqual(shop, before);
  assert.equal(book.seen.size, 0, "a forged event must not poison the duplicate check");
});

test("missing PayPal headers are refused before any verify call", async () => {
  const { book, shop } = setup();
  let asked = false;
  const headers = { ...HEADERS };
  delete headers["paypal-transmission-sig"];
  const response = await deliver(book, shop, voided(), {
    headers,
    verify: async () => {
      asked = true;
      return true;
    },
  });
  assert.equal(response.status, 400);
  assert.equal(asked, false);
});

test("a body that is not an event is refused before any verify call", async () => {
  const { book, shop } = setup();
  for (const body of ["not json", "[]", '{"event_type":"PAYMENT.AUTHORIZATION.VOIDED"}']) {
    const response = await deliver(book, shop, body, { verify: async () => assert.fail("verify ran") });
    assert.equal(response.status, 400, body);
  }
});

test("a verify outage answers non-2xx so PayPal retries, and the retry still applies", async () => {
  const { book, shop } = setup();
  const failed = await deliver(book, shop, voided(), {
    verify: async () => {
      throw new Error("PayPal is down");
    },
  });
  assert.equal(failed.status, 502);
  assert.equal(shop.phase, "authorized");
  const retried = await deliver(book, shop, voided());
  assert.equal(retried.status, 200);
  assert.equal(shop.phase, "quoted");
});

test("the verify call carries the raw bytes PayPal sent", async () => {
  const { book, shop } = setup();
  const raw = `{ "id" : "WH-raw",  "event_type":"PAYMENT.AUTHORIZATION.CREATED", "resource":{"id":"${AUTH}","amount":{"value":"336.00"}, "note":"caf\\u00e9"} }`;
  let sent = "";
  await deliver(book, shop, raw, {
    verify: async (body) => {
      sent = body;
      return true;
    },
  });
  assert.ok(sent.endsWith(`"webhook_event":${raw}}`));
  const parsed = JSON.parse(sent) as Record<string, unknown>;
  assert.equal(parsed.webhook_id, "WH-ID-1");
  assert.equal(parsed.transmission_id, "tx-1");
  assert.equal(parsed.auth_algo, "SHA256withRSA");
  assert.equal(parsed.cert_url, HEADERS["paypal-cert-url"]);
  assert.equal(parsed.transmission_sig, "c2lnbmF0dXJl");
  assert.equal(parsed.transmission_time, "2026-10-08T12:00:00Z");
});

test("verificationBody cannot be steered by a header value", () => {
  const body = verificationBody('{"id":"x"}', { transmission_id: 'a","webhook_id":"evil' }, "WH-ID-1");
  const parsed = JSON.parse(body) as Record<string, unknown>;
  assert.equal(parsed.webhook_id, "WH-ID-1");
});

test("a duplicate event is ignored", async () => {
  const { book, shop } = setup();
  await deliver(book, shop, captured());
  await deliver(book, shop, refunded());
  const version = shop.version;
  const lines = shop.transcript.length;
  const repeat = await deliver(book, shop, refunded());
  assert.equal(repeat.status, 200);
  assert.deepEqual(repeat.body, { received: true, ignored: "duplicate" });
  assert.equal(shop.ledger[0].refunded, 80);
  assert.equal(shop.version, version);
  assert.equal(shop.transcript.length, lines);
});

test("the same refund under a new event id is still booked once", async () => {
  const { book, shop } = setup();
  await deliver(book, shop, captured());
  await deliver(book, shop, refunded("WH-refund-1"));
  await deliver(book, shop, refunded("WH-refund-2"));
  assert.equal(shop.ledger[0].refunded, 80);
});

test("an unknown order is ignored with a 200 so PayPal stops retrying", async () => {
  const { book, shop } = setup();
  const before = structuredClone(shop);
  const event = voided();
  event.resource = { id: "NOT-OURS", links: [{ rel: "up", href: "https://x/v2/checkout/orders/ALSO-NOT-OURS" }] };
  const response = await deliver(book, shop, event);
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { received: true, ignored: "unknown order" });
  assert.deepEqual(shop, before);
});

test("an event type this shop does not handle is ignored with a 200", async () => {
  const { book, shop } = setup();
  const before = structuredClone(shop);
  const response = await deliver(book, shop, { id: "WH-x", event_type: "BILLING.PLAN.CREATED", resource: { id: "P-1" } });
  assert.deepEqual(response, { status: 200, body: { received: true, ignored: "unhandled event" } });
  assert.deepEqual(shop, before);
});

test("an event for the order before a week reset cannot touch the new week", async () => {
  const { book, shop } = setup();
  shop.paypal = { mode: "live", orderId: "NEW-ORDER", authorizationId: "NEW-AUTH", status: "AUTHORIZED" };
  const before = structuredClone(shop);
  const response = await deliver(book, shop, voided());
  assert.deepEqual(response.body, { received: true, ignored: "stale order" });
  assert.deepEqual(shop, before);
});

test("an evicted shop is not rebuilt by a webhook", async () => {
  const { book } = setup();
  const response = await deliver(book, undefined, voided());
  assert.deepEqual(response.body, { received: true, ignored: "stale order" });
});

test("a void releases the floor", async () => {
  const { book, shop } = setup();
  const response = await deliver(book, shop, voided());
  assert.equal(response.status, 200);
  const desk = shop.events.filter((event) => event.orderId === ORDER);
  assert.deepEqual(desk.map((event) => event.status), ["released", "released"]);
  assert.equal(shop.phase, "quoted");
  assert.equal(shop.paypal?.status, "VOIDED");
  assert.equal(shop.paypal?.released, true);
  assert.equal(shop.ledger[0].status, "Voided");
  assert.equal(shop.version, 2);
  assert.match(shop.transcript.at(-1)?.text ?? "", /floor released the desk/);
  assert.equal(shop.paypal?.webhook?.note, "Confirmed by PayPal webhook: hold voided.");
});

test("a denied capture releases the floor, under either event name", async () => {
  for (const name of ["PAYMENT.CAPTURE.DENIED", "PAYMENT.CAPTURE.DECLINED"]) {
    const { book, shop } = setup();
    await deliver(book, shop, denied(name));
    assert.deepEqual(shop.events.filter((event) => event.orderId === ORDER).map((event) => event.status), ["released", "released"]);
    assert.equal(shop.phase, "quoted");
    assert.equal(shop.ledger[0].status, "Denied");
  }
});

test("a denial undoes a capture call that PayPal left pending", async () => {
  const { book, shop } = setup(deskShop("captured"));
  shop.paypal!.captureId = CAPTURE;
  shop.ledger[0].captured = 336;
  rememberCapture(book, ORDER, CAPTURE, "PENDING", 336);
  await deliver(book, shop, denied());
  assert.equal(shop.phase, "quoted");
  assert.equal(shop.paypal?.captureId, undefined);
  assert.equal(shop.ledger[0].captured, 0);
});

test("a void does not undo a capture PayPal called complete", async () => {
  const { book, shop } = setup(deskShop("captured"));
  shop.paypal!.captureId = CAPTURE;
  rememberCapture(book, ORDER, CAPTURE, "COMPLETED", 336);
  await deliver(book, shop, voided());
  assert.equal(shop.phase, "captured");
  assert.equal(shop.events.find((event) => event.id === "desk-mill")?.status, "committed");
});

test("a void delivered ahead of its hold stays released", async () => {
  const { book, shop } = setup();
  await deliver(book, shop, voided());
  await deliver(book, shop, held());
  assert.equal(shop.phase, "quoted");
  assert.equal(shop.events.find((event) => event.id === "desk-mill")?.status, "released");
  assert.equal(shop.paypal?.webhook?.note, "Confirmed by PayPal webhook: hold voided.");
});

test("a capture delivered after a void wins and the floor takes the desk back", async () => {
  const { book, shop } = setup();
  await deliver(book, shop, voided());
  await deliver(book, shop, captured());
  assert.equal(shop.phase, "captured");
  assert.equal(shop.paypal?.released, false);
  assert.equal(shop.ledger[0].captured, 336);
  const mill = shop.events.find((event) => event.id === "desk-mill");
  assert.equal(mill?.status, "committed");
  assert.equal(mill?.name, "Writing desk: mill");
});

test("a late hold does not pull a captured shop backward", async () => {
  const { book, shop } = setup();
  await deliver(book, shop, captured());
  await deliver(book, shop, held());
  assert.equal(shop.phase, "captured");
  assert.equal(shop.paypal?.webhook?.note, "Confirmed by PayPal webhook: capture completed.");
});

test("a refund delivered ahead of its capture waits, then both apply", async () => {
  const { book, shop } = setup();
  const first = await deliver(book, shop, refunded());
  assert.deepEqual(first.body, { received: true, ignored: "unknown order" });
  assert.equal(shop.phase, "authorized");
  await deliver(book, shop, captured());
  assert.equal(shop.phase, "refunded");
  assert.equal(shop.ledger[0].captured, 336);
  assert.equal(shop.ledger[0].refunded, 80);
  assert.equal(shop.ledger[0].status, "Partial refund");
  assert.equal(shop.paypal?.status, "PARTIALLY_REFUNDED");
});

test("a parked refund applies when our own capture call teaches us its capture id", async () => {
  const { book, shop } = setup(deskShop("captured"));
  shop.paypal!.captureId = CAPTURE;
  shop.ledger[0].captured = 336;
  await deliver(book, shop, refunded());
  assert.equal(shop.ledger[0].refunded, 0);
  rememberCapture(book, ORDER, CAPTURE, "COMPLETED", 336);
  settle(book, shop);
  assert.equal(shop.phase, "refunded");
  assert.equal(shop.ledger[0].refunded, 80);
  assert.equal(book.parked.length, 0);
});

test("a capture webhook advances a shop whose button call never returned", async () => {
  const { book, shop } = setup();
  await deliver(book, shop, captured());
  assert.equal(shop.phase, "captured");
  assert.equal(shop.paypal?.captureId, CAPTURE);
  assert.equal(shop.ledger[0].status, "Captured");
  assert.equal(shop.paypal?.webhook?.note, "Confirmed by PayPal webhook: capture completed.");
});

test("a refund is not booked twice when the webhook beats the button", async () => {
  const { book, shop } = setup(deskShop("captured"));
  shop.paypal!.captureId = CAPTURE;
  shop.ledger[0].captured = 336;
  rememberCapture(book, ORDER, CAPTURE, "COMPLETED", 336);
  await deliver(book, shop, refunded());
  assert.equal(bookRefund(shop, REFUND, 80), false);
  assert.equal(shop.ledger[0].refunded, 80);
});

test("a refund the button booked is confirmed, not booked again, by the webhook", async () => {
  const { book, shop } = setup(deskShop("captured"));
  shop.paypal!.captureId = CAPTURE;
  shop.ledger[0].captured = 336;
  rememberCapture(book, ORDER, CAPTURE, "COMPLETED", 336);
  assert.equal(bookRefund(shop, REFUND, 80), true);
  await deliver(book, shop, refunded());
  assert.equal(shop.ledger[0].refunded, 80);
  assert.equal(shop.paypal?.webhook?.note, "Confirmed by PayPal webhook: refund completed.");
});

test("a second refund adds to the first and a full refund says so", async () => {
  const { book, shop } = setup();
  await deliver(book, shop, captured());
  await deliver(book, shop, refunded("WH-r1", "REF-1", "80.00"));
  await deliver(book, shop, refunded("WH-r2", "REF-2", "256.00"));
  assert.equal(shop.ledger[0].refunded, 336);
  assert.equal(shop.ledger[0].status, "Refunded");
  assert.equal(shop.paypal?.status, "REFUNDED");
  // Cost is 420 throughout: 840 at 50%. Net is 504 after both refunds.
  assert.ok(Math.abs(shop.ledger[0].margin - (504 - 420) / 504) < 1e-9);
});

test("a void that lands while the authorize call is open applies once that call settles", async () => {
  const { book, shop } = setup(deskShop("quoted"));
  await deliver(book, shop, voided());
  assert.equal(shop.events.find((event) => event.id === "desk-mill")?.status, "committed");
  shop.phase = "authorized";
  settle(book, shop);
  assert.equal(shop.phase, "quoted");
  assert.equal(shop.events.find((event) => event.id === "desk-mill")?.status, "released");
});

test("a refund routes by the capture id our own call remembered", async () => {
  const { book, shop } = setup();
  rememberCapture(book, ORDER, CAPTURE, "COMPLETED", 336);
  await deliver(book, shop, refunded());
  assert.equal(shop.phase, "refunded");
  assert.equal(shop.ledger[0].refunded, 80);
});

test("the second visitor's order routes to the second shop", async () => {
  const { book, shop } = setup();
  const other = deskShop();
  other.paypal!.orderId = "ORDER-B";
  other.events = other.events.map((event) => (event.orderId === ORDER ? { ...event, orderId: "ORDER-B" } : event));
  rememberOrder(book, "visitor-b", "ORDER-B");
  const event = voided();
  event.resource = { id: "AUTH-B", supplementary_data: { related_ids: { order_id: "ORDER-B" } } };
  await handleWebhookRequest({
    rawBody: JSON.stringify(event),
    headers: new Headers(HEADERS),
    webhookId: "WH-ID-1",
    verify: async () => true,
    book,
    shopFor: (visitor) => (visitor === VISITOR ? shop : visitor === "visitor-b" ? other : undefined),
  });
  assert.equal(other.phase, "quoted");
  assert.equal(shop.phase, "authorized");
});
