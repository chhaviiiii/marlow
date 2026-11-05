import { NextResponse } from "next/server";
import { paypalConfigured, verifyWebhookSignature } from "@/server/paypal/client";
import { handleWebhookRequest, sharedBook } from "@/server/paypal/webhook";
import { visitorShop } from "@/server/shop";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // The raw text, not request.json(): PayPal verifies the bytes it sent.
  const rawBody = await request.text();
  const { status, body } = await handleWebhookRequest({
    rawBody,
    headers: request.headers,
    webhookId: process.env.PAYPAL_WEBHOOK_ID,
    verify: paypalConfigured() ? verifyWebhookSignature : null,
    book: sharedBook(),
    shopFor: visitorShop,
  });
  return NextResponse.json(body, { status });
}
