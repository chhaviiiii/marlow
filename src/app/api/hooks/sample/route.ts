import { NextResponse } from "next/server";
import { sampleHook } from "@/server/shop";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(sampleHook());
}
