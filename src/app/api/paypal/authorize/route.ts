import { NextResponse } from "next/server";
import { authorizeDeposit } from "@/server/shop";
import { withVisitor } from "@/server/visitor";

export const dynamic = "force-dynamic";

export const POST = withVisitor(async (request: Request) => {
  const body = (await request.json().catch(() => ({}))) as { orderId?: string };
  return NextResponse.json(await authorizeDeposit(body.orderId));
});
