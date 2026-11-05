import { NextResponse } from "next/server";
import { authorizeDeposit } from "@/server/shop";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { orderId?: string };
  return NextResponse.json(await authorizeDeposit(body.orderId));
}
