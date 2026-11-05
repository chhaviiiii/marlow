import {
  CheckoutPaymentIntent,
  Client,
  Environment,
  OrdersController,
  PaymentsController,
} from "@paypal/paypal-server-sdk";
import { moneyString } from "@/lib/format";
import { contextSummary } from "./context";

export function paypalConfigured() {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

export function paypalMode(): "live" | "rehearsal" {
  return paypalConfigured() ? "live" : "rehearsal";
}

function apiBase() {
  return process.env.PAYPAL_ENVIRONMENT === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

function controllers() {
  const client = new Client({
    clientCredentialsAuthCredentials: {
      oAuthClientId: process.env.PAYPAL_CLIENT_ID ?? "",
      oAuthClientSecret: process.env.PAYPAL_CLIENT_SECRET ?? "",
    },
    environment:
      process.env.PAYPAL_ENVIRONMENT === "live"
        ? Environment.Production
        : Environment.Sandbox,
  });
  return {
    orders: new OrdersController(client),
    payments: new PaymentsController(client),
  };
}

async function accessToken() {
  const id = process.env.PAYPAL_CLIENT_ID ?? "";
  const secret = process.env.PAYPAL_CLIENT_SECRET ?? "";
  const res = await fetch(`${apiBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    throw new Error(`PayPal auth failed (${res.status}).`);
  }
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

/** Returns false when PayPal refuses the signature. Throws when PayPal cannot answer. */
export async function verifyWebhookSignature(body: string) {
  const token = await accessToken();
  const res = await fetch(`${apiBase()}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body,
  });
  if (res.status >= 500) throw new Error(`PayPal verify failed (${res.status}).`);
  if (!res.ok) return false;
  const json = (await res.json()) as { verification_status?: string };
  return json.verification_status === "SUCCESS";
}

export async function createDepositOrder(input: {
  amount: number;
  description: string;
  customId: string;
}) {
  const { orders } = controllers();
  const { result } = await orders.createOrder({
    body: {
      intent: CheckoutPaymentIntent.Authorize,
      purchaseUnits: [
        {
          customId: input.customId,
          description: input.description,
          amount: {
            currencyCode: "USD",
            value: moneyString(input.amount),
          },
        },
      ],
    },
    paypalRequestId: crypto.randomUUID(),
    prefer: "return=representation",
  });
  if (!result.id) throw new Error("PayPal did not return an order id.");
  return { orderId: result.id, status: result.status ?? "CREATED" };
}

export async function authorizeOrder(orderId: string) {
  const { orders } = controllers();
  const { result } = await orders.authorizeOrder({
    id: orderId,
    paypalRequestId: crypto.randomUUID(),
    prefer: "return=representation",
  });
  const authorizationId =
    result.purchaseUnits?.[0]?.payments?.authorizations?.[0]?.id;
  if (!authorizationId) {
    throw new Error("PayPal authorized the order without an authorization id.");
  }
  return { authorizationId, status: result.status ?? "AUTHORIZED" };
}

export async function captureAuthorization(authorizationId: string, amount: number) {
  const { payments } = controllers();
  const { result } = await payments.captureAuthorizedPayment({
    authorizationId,
    paypalRequestId: crypto.randomUUID(),
    prefer: "return=representation",
    body: {
      amount: { currencyCode: "USD", value: moneyString(amount) },
      finalCapture: true,
    },
  });
  if (!result.id) throw new Error("PayPal capture did not return an id.");
  return { captureId: result.id, status: result.status ?? "COMPLETED" };
}

export async function refundCapture(captureId: string, amount: number) {
  const { payments } = controllers();
  const { result } = await payments.refundCapturedPayment({
    captureId,
    paypalRequestId: crypto.randomUUID(),
    prefer: "return=representation",
    body: {
      amount: { currencyCode: "USD", value: moneyString(amount) },
      noteToPayer: "Partial refund before delivery.",
    },
  });
  if (!result.id) throw new Error("PayPal refund did not return an id.");
  return { refundId: result.id, status: result.status ?? "COMPLETED" };
}

export async function createBalanceInvoice(input: {
  amount: number;
  piece: string;
  buyer: string;
}) {
  const token = await accessToken();
  const merchantEmail = process.env.PAYPAL_MERCHANT_EMAIL || "merchant@fieldandgrain.test";
  const res = await fetch(`${apiBase()}/v2/invoicing/invoices`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      detail: {
        currency_code: "USD",
        note: "Balance due when the piece is delivered. Deposit already authorized.",
        payment_term: { term_type: "DUE_ON_RECEIPT" },
        memo: contextSummary(),
      },
      invoicer: {
        name: { given_name: "Field", surname: "Grain" },
        email_address: merchantEmail,
      },
      primary_recipients: [
        {
          billing_info: {
            name: { given_name: input.buyer },
            email_address:
              process.env.PAYPAL_BUYER_EMAIL ||
              `${input.buyer.toLowerCase().replace(/[^a-z0-9]+/g, "") || "buyer"}@agents.test`,
          },
        },
      ],
      items: [
        {
          name: `${input.piece}, balance on delivery`,
          quantity: "1",
          unit_amount: { currency_code: "USD", value: moneyString(input.amount) },
        },
      ],
    }),
  });
  const json = (await res.json()) as { id?: string; message?: string; details?: unknown };
  if (!res.ok || !json.id) {
    throw new Error(json.message || `Invoice failed (${res.status}).`);
  }
  return { invoiceId: json.id };
}
