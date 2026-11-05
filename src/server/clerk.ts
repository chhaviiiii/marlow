import { generateText, stepCountIs, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import type { ActionResult } from "@/lib/types";
import { containsPan, lookupAgent } from "./agent-pay";
import { PAYPAL_CONTEXT } from "./paypal/context";
import { consider, getShop, searchPieces } from "./shop";

export const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

function localAsk(message: string): Promise<ActionResult> | ActionResult {
  return consider(message);
}

export async function askClerk(message: string): Promise<ActionResult> {
  const trimmed = message.trim();
  if (!trimmed) return localAsk("hello");
  if (containsPan(trimmed) || !process.env.OPENAI_API_KEY) return localAsk(trimmed);

  const shop = getShop();
  const before = shop.transcript.length;
  const phaseBefore = shop.phase;
  shop.transcript.push({
    id: `t-ask-${before}`,
    role: "buyer",
    who: lookupAgent(trimmed)?.name ?? "You",
    text: trimmed,
  });

  try {
    const result = await generateText({
      model: openai(MODEL),
      system: [
        "You are Marlow, the shop agent at Field & Grain, a furniture workshop in Austin.",
        "Your buyers are other AI agents acting for people. Registered buyers: Juniper, Northwind, Atelier. Anyone else is refused by the mandate check.",
        "To quote, call take_request with one plain sentence that names the piece, the buyer agent, the city if given, and the ceiling as $N if given.",
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
          description: "Search or quote any catalog piece for the buyer named in the message. Runs catalog, market, policy, mandate, and PayPal checks.",
          inputSchema: z.object({ message: z.string() }),
          execute: async ({ message }) => {
            const action = await consider(message, false);
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
    const fallback = await consider(trimmed);
    fallback.shop.transcript.push({
      id: `t-ask-${before}-e`,
      role: "note",
      text: "The model did not answer, so the shop rules handled this request.",
    });
    fallback.shop.version += 1;
    return { shop: fallback.shop, added: fallback.shop.transcript.length - before };
  }
}
