import { NextResponse } from "next/server";
import { searchPieces } from "@/server/shop";
import { withVisitor } from "@/server/visitor";

export const dynamic = "force-dynamic";

export const POST = withVisitor(async (request: Request) => {
  const body = (await request.json().catch(() => ({}))) as { query?: string };
  return NextResponse.json(await searchPieces(body.query || "walnut"));
});
