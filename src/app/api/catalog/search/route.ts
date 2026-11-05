import { NextResponse } from "next/server";
import { searchPieces } from "@/server/shop";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { query?: string };
  return NextResponse.json(await searchPieces(body.query || "walnut"));
}
