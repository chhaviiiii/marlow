import { NextResponse } from "next/server";
import { hasShop } from "./shop";
import { isOrderId } from "./buyer-desk";
import { inShop } from "./visitor";

type Context = { params: Promise<{ id: string }> };

/**
 * The person's side of an agent's order. Browsers set Sec-Fetch-Site on a
 * button press from the approval page, and a plain agent HTTP call does not.
 * That header only stops the casual call. In sandbox, the real gate is the
 * person's own PayPal login, and PayPal refuses an order nobody approved.
 */
export function forApprovalPage(handler: (id: string, request: Request) => Promise<Response> | Response) {
  return async (request: Request, context: Context) => {
    const { id } = await context.params;
    if (request.method !== "GET" && request.headers.get("sec-fetch-site") !== "same-origin") {
      return NextResponse.json({ reason: "A person approves this from the approval page." }, { status: 403 });
    }
    if (!isOrderId(id) || !inShop(id, hasShop)) {
      return NextResponse.json({ reason: "There is no order with that id." }, { status: 404 });
    }
    return inShop(id, () => handler(id, request));
  };
}
