import { NextResponse } from "next/server";
import { getShop, resetShop } from "@/server/shop";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(getShop());
}

export function POST() {
  return NextResponse.json(resetShop());
}
