import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Acceptance for a buyer agent, following the public agentic-commerce rules
 * the card networks have published: know the agent, require verifiable
 * intent, bind a token to the mandate, and never accept a card number.
 *
 * PayPal remains the merchant's capture rail. The token says who is allowed
 * to cause that authorization. It is not a PAN and it is not a second charge.
 */

export type AgentIntent = {
  agentId: string;
  ceiling: number;
  city: string;
  deliverBy: string;
  consent: boolean;
  note: string;
};

export type PresentedAgent = AgentIntent & {
  signature: string;
};

export type Admission = {
  agentId: string;
  agentName: string;
  mandateId: string;
  tokenRef: string;
  rail: "paypal-authorize";
  reason: string;
};

type RegisteredAgent = {
  name: string;
  secret: string;
};

const REGISTRY: Record<string, RegisteredAgent> = {
  agt_juniper_household: { name: "Juniper", secret: "juniper-registered-agent" },
  agt_northwind: { name: "Northwind", secret: "northwind-registered-agent" },
  agt_atelier: { name: "Atelier", secret: "atelier-registered-agent" },
};

export function lookupAgent(text: string): { agentId: string; name: string } | null {
  const q = text.toLowerCase();
  for (const [agentId, agent] of Object.entries(REGISTRY)) {
    if (q.includes(agent.name.toLowerCase())) return { agentId, name: agent.name };
  }
  return null;
}

export function presentAgent(agentId: string, intent: Omit<AgentIntent, "agentId">): PresentedAgent | null {
  const known = REGISTRY[agentId];
  if (!known) return null;
  const full: AgentIntent = { agentId, ...intent };
  return { ...full, signature: signIntent(full, known.secret) };
}

export function canonical(intent: AgentIntent) {
  return [
    intent.agentId,
    intent.ceiling.toFixed(2),
    intent.city,
    intent.deliverBy,
    intent.consent ? "consent" : "none",
    intent.note,
  ].join("|");
}

export function signIntent(intent: AgentIntent, secret: string) {
  return createHmac("sha256", secret).update(canonical(intent)).digest("hex");
}

function luhn(digits: string) {
  let sum = 0;
  let alternate = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let n = Number(digits[i]);
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

/** A primary account number, not an order id or a price. */
export function containsPan(text: string) {
  const candidates = text.match(/(?:\d[ -]?){13,19}/g) ?? [];
  return candidates.some((raw) => {
    const digits = raw.replace(/\D/g, "");
    return digits.length >= 13 && digits.length <= 19 && luhn(digits);
  });
}

function displayName(agentId: string) {
  const bare = agentId.replace(/^agt_/, "").replace(/_/g, " ");
  return bare.charAt(0).toUpperCase() + bare.slice(1);
}

function signaturesMatch(presented: string, expected: string) {
  const left = Buffer.from(presented);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function admit(presented: PresentedAgent): { ok: true; admission: Admission } | { ok: false; reason: string } {
  const blob = `${presented.note} ${presented.city} ${presented.agentId}`;
  if (containsPan(blob)) {
    return {
      ok: false,
      reason: "A card number was presented. This shop does not take a PAN. A registered agent brings a bound token, or it does not buy.",
    };
  }
  const known = REGISTRY[presented.agentId];
  if (!known) {
    return {
      ok: false,
      reason: `${displayName(presented.agentId)} is not a registered agent. An unknown session does not get to move the mill.`,
    };
  }
  if (!presented.consent) {
    return { ok: false, reason: "There is no consent to pay. Intent without consent is not a mandate." };
  }
  const expected = signIntent(presented, known.secret);
  if (!signaturesMatch(presented.signature, expected)) {
    return { ok: false, reason: "The mandate signature does not match the registered agent. The intent was altered, or it was never theirs." };
  }
  const mandateId = `mdt_${presented.signature.slice(0, 12)}`;
  return {
    ok: true,
    admission: {
      agentId: presented.agentId,
      agentName: known.name,
      mandateId,
      tokenRef: `tok_${presented.agentId}_${presented.signature.slice(0, 8)}`,
      rail: "paypal-authorize",
      reason: `${known.name} is registered. Mandate ${mandateId} is signed for ${presented.city}, ceiling ${presented.ceiling.toFixed(0)}. PayPal may hold the deposit.`,
    },
  };
}

export function juniperPresentation(): PresentedAgent {
  const presented = presentAgent("agt_juniper_household", {
    ceiling: 880,
    city: "Austin 78702",
    deliverBy: "2026-10-09T12:00:00-05:00",
    consent: true,
    note: "Walnut writing desk. In the room before Friday noon.",
  });
  if (!presented) throw new Error("Juniper is missing from the agent registry.");
  return presented;
}
