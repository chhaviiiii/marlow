import { NextResponse } from "next/server";
import { createPayPalOrder } from "@/server/shop";
import { withVisitor } from "@/server/visitor";

export const dynamic = "force-dynamic";

export const POST = withVisitor(async () => {
  const result = await createPayPalOrder();
  if (!result.orderId) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result);
});
