import { NextResponse } from "next/server";
import { forApprovalPage } from "@/server/order-routes";
import { createPayPalOrder } from "@/server/shop";

export const dynamic = "force-dynamic";

export const POST = forApprovalPage(async () => {
  const { orderId, shop } = await createPayPalOrder();
  const reply = { orderId, shop: { phase: shop.phase, transcript: shop.transcript.slice(-1) } };
  return NextResponse.json(reply, { status: orderId ? 200 : 400 });
});
