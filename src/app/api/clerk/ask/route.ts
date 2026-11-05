import { NextResponse } from "next/server";
import { askClerk } from "@/server/clerk";
import { withVisitor } from "@/server/visitor";

export const dynamic = "force-dynamic";

export const POST = withVisitor(async (request: Request) => {
  const body = (await request.json().catch(() => ({}))) as { message?: string; mandate?: unknown };
  const mandate = typeof body.mandate === "string" ? body.mandate : undefined;
  return NextResponse.json(await askClerk(body.message ?? "", mandate));
});
