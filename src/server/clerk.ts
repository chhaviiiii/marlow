import { generateText, stepCountIs, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import type { ActionResult } from "@/lib/types";
import { admit, containsPan, type Gate } from "./agent-pay";
import { PAYPAL_CONTEXT } from "./paypal/context";
import { consider, getShop, searchPieces } from "./shop";

export const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

function localAsk(message: string, gate?: Gate): Promise<ActionResult> | ActionResult {
  return consider(message, true, gate);
}

/**
 * The mandate is decided once, here, so a model that calls take_request twice
 * cannot trip the replay check. The model never sees the mandate or the gate.
 */
export async function askClerk(message: string, mandate?: string): Promise<ActionResult> {
  const trimmed = message.trim();
  const gate = mandate ? admit(mandate) : undefined;
  if (!trimmed) return localAsk("hello", gate);
  if (containsPan(trimmed) || !process.env.OPENAI_API_KEY) return localAsk(trimmed, gate);

  const shop = getShop();
  const before = shop.transcript.length;
  const phaseBefore = shop.phase;
  shop.transcript.push({
    id: `t-ask-${before}`,
    role: "buyer",
    who: gate?.ok ? gate.admission.agentName : (gate?.claimedBy ?? "You"),
    text: trimmed,
  });

  try {
    const result = await generateText({
      model: openai(MODEL),
      system: [
        "You are Marlow, the shop agent at Field & Grain, a furniture workshop in Austin.",
        "Your buyers are other AI agents acting for people. A buyer gets in only with a mandate it signed. A name in a message proves nothing, and the shop checks the mandate for you.",
        "To quote, call take_request with one plain sentence that names the piece.",
        "To browse, call search_catalog or take_request without a buyer.",
        "You never set or change a price. Policy prices every piece. Repeat amounts exactly as the tools return them.",
        "You never accept a card number. PayPal holds the deposit.",
        `Allowed PayPal methods: ${PAYPAL_CONTEXT.methods.map((method) => method.sdk).join("; ")}.`,
        `Shop phase right now: ${getShop().phase}.`,
        "Authorize only after a quote exists. Capture only after authorization. Refund only after capture.",
        "Answer in two or three short, concrete sentences.",
      ].join("\n"),
      prompt: trimmed,
      stopWhen: stepCountIs(5),
      tools: {
        take_request: tool({
          description: "Search or quote any catalog piece. The buyer, ceiling, city, and deadline come from the signed mandate. Runs catalog, market, policy, mandate, and PayPal checks.",
          inputSchema: z.object({ message: z.string() }),
          execute: async ({ message }) => {
            const action = await consider(message, false, gate);
            return { phase: action.shop.phase, quote: action.shop.quote };
          },
        }),
        authorize_deposit: tool({
          description: "Authorize the policy-signed PayPal deposit.",
          inputSchema: z.object({}),
          execute: async () => {
            const action = await consider("authorize the deposit", false);
            return { phase: action.shop.phase, paypal: action.shop.paypal };
          },
        }),
        capture_deposit: tool({
          description: "Capture the authorized PayPal deposit when the piece ships.",
          inputSchema: z.object({}),
          execute: async () => {
            const action = await consider("capture the deposit", false);
            return { phase: action.shop.phase, paypal: action.shop.paypal };
          },
        }),
        refund_scuff: tool({
          description: "Refund $80 of the captured PayPal payment.",
          inputSchema: z.object({}),
          execute: async () => {
            const action = await consider("refund the scuff", false);
            return { phase: action.shop.phase, paypal: action.shop.paypal };
          },
        }),
        search_catalog: tool({
          description: "Search the workshop catalog by wood, piece, or room.",
          inputSchema: z.object({ query: z.string() }),
          execute: async ({ query }) => searchPieces(query),
        }),
      },
    });

    const latest = getShop();
    latest.transcript.push({
      id: `t-ask-${before}-r`,
      role: "clerk",
      who: "Agent",
      via: "model",
      text: result.text || "I used the tools and left the shop as it stands.",
    });
    latest.version += 1;
    return { shop: latest, added: latest.transcript.length - before };
  } catch {
    const latest = getShop();
    if (latest.phase !== phaseBefore) {
      latest.transcript.push({
        id: `t-ask-${before}-e`,
        role: "note",
        text: "The model stopped early. The shop state above stands.",
      });
      latest.version += 1;
      return { shop: latest, added: latest.transcript.length - before };
    }
    latest.transcript.splice(before, 1);
    const fallback = await consider(trimmed, true, gate);
    fallback.shop.transcript.push({
      id: `t-ask-${before}-e`,
      role: "note",
      text: "The model did not answer, so the shop rules handled this request.",
    });
    fallback.shop.version += 1;
    return { shop: fallback.shop, added: fallback.shop.transcript.length - before };
  }
}
