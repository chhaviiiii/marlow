import { NextResponse } from "next/server";
import { askClerk } from "@/server/clerk";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { message?: string };
  return NextResponse.json(await askClerk(body.message ?? ""));
}
