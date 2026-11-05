import { NextResponse } from "next/server";
import { sweepHolds } from "@/server/shop";
import { withVisitor } from "@/server/visitor";

export const dynamic = "force-dynamic";

export const POST = withVisitor(async () => {
  return NextResponse.json(await sweepHolds());
});
