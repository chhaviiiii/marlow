import { NextResponse } from "next/server";
import { forApprovalPage } from "@/server/order-routes";
import { authorizeDeposit } from "@/server/shop";

export const dynamic = "force-dynamic";

/** The order id comes from the shop, never from the request body. */
export const POST = forApprovalPage(async () => {
  const { shop } = await authorizeDeposit();
  return NextResponse.json({ shop: { phase: shop.phase, transcript: shop.transcript.slice(-1) } });
});
