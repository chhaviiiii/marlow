import { NextResponse } from "next/server";
import { createPayPalOrder } from "@/server/shop";

export const dynamic = "force-dynamic";

export async function POST() {
  const result = await createPayPalOrder();
  if (!result.orderId) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result);
}
