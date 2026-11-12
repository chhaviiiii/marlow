import { buyerDesk } from "@/server/buyer-desk";
import { handleMcp } from "@/server/mcp";

export const dynamic = "force-dynamic";

/** POST only. This server keeps no sessions and opens no event stream, so GET answers 405. */
export function POST(request: Request) {
  return handleMcp(request, buyerDesk);
}
