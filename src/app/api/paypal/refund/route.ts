import { NextResponse } from "next/server";
import { refundScuff } from "@/server/shop";

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(await refundScuff());
}
