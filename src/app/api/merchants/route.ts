import { NextResponse } from "next/server";
import { checkSetup, MAX_CATALOG_BYTES, type SetupErrors } from "@/lib/merchant-sheet";
import { containsPan } from "@/server/agent-pay";
import { publicOrigin } from "@/server/mcp";
import { createMerchant } from "@/server/merchants";

export const dynamic = "force-dynamic";

/** Room for the catalog plus the form around it. JSON escaping can add a little. */
const MAX_BODY_BYTES = MAX_CATALOG_BYTES + 256 * 1024;

const tooLarge = () =>
  NextResponse.json({ errors: { catalog: "The catalog is over 1 MB." } satisfies SetupErrors }, { status: 413 });

/** Stops reading at the cap, so a long body costs no more memory than a legal one. */
async function readCapped(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return null;
  if (!request.body) return "";
  const decoder = new TextDecoder();
  const reader = request.body.getReader();
  let size = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) return text + decoder.decode();
    size += value.length;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
}

export async function POST(request: Request) {
  const text = await readCapped(request);
  if (text === null) return tooLarge();
  let form: unknown;
  try {
    form = JSON.parse(text);
  } catch {
    return NextResponse.json({ errors: { name: "The form did not arrive. Try again." } satisfies SetupErrors }, { status: 400 });
  }

  const checked = checkSetup(form, containsPan);
  if (!checked.ok) return NextResponse.json({ errors: checked.errors }, { status: 422 });

  const merchant = createMerchant(checked.setup);
  const origin = publicOrigin(request);
  return NextResponse.json(
    {
      id: merchant.id,
      name: merchant.name,
      pieces: merchant.pieces.length,
      shopUrl: `${origin}/m/${merchant.id}`,
      mcpUrl: `${origin}/api/mcp/${merchant.id}`,
      notes: checked.setup.notes,
    },
    { status: 201 },
  );
}
