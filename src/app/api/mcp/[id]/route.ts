import { NextResponse } from "next/server";
import { merchantDesk } from "@/server/buyer-desk";
import { handleMcp } from "@/server/mcp";
import { findMerchant } from "@/server/merchants";

export const dynamic = "force-dynamic";

/** The same MCP server as /api/mcp, with this merchant's catalog, policy, and mandate claim. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const merchant = findMerchant(id);
  if (!merchant) {
    return NextResponse.json(
      { reason: "There is no shop with that id. Shops live in server memory, so a restart removes them." },
      { status: 404 },
    );
  }
  return handleMcp(request, merchantDesk(merchant));
}
