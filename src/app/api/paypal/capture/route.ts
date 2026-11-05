import { NextResponse } from "next/server";
import { captureDeposit } from "@/server/shop";

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(await captureDeposit());
}
