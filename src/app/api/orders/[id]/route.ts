import { NextResponse } from "next/server";
import { orderStatus } from "@/server/buyer-desk";
import { publicOrigin } from "@/server/mcp";
import { forApprovalPage } from "@/server/order-routes";
import { getShop } from "@/server/shop";

export const dynamic = "force-dynamic";

/** Reading an order never changes it, so a link preview cannot approve anything. */
export const GET = forApprovalPage((id, request) => {
  const shop = getShop();
  return NextResponse.json({
    ...orderStatus(id, publicOrigin(request)),
    paypalClientId: shop.paypalClientId,
    merchantName: shop.merchant.name,
    createdShop: Boolean(shop.merchant.id),
  });
});
