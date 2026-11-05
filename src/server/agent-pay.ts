import { createHash, createPublicKey, verify } from "node:crypto";

/**
 * Acceptance for a buyer agent, following the public agentic-commerce rules
 * the card networks have published: know the agent, require verifiable
 * intent, bind a token to the mandate, and never accept a card number.
 *
 * The buyer holds the private key and signs its own mandate. The shop keeps
 * public keys only, so it can check a mandate but can never write one.
 *
 * A mandate is a compact JWS (EdDSA). PayPal remains the merchant's capture
 * rail. The token says who is allowed to cause that authorization. It is not
 * a PAN and it is not a second charge.
 */

const MERCHANT = "field-and-grain";
const MAX_TOKEN_LENGTH = 4096;
/** A nonce must outlive its mandate, so a long-lived mandate is refused. */
const MAX_LIFETIME_MS = 24 * 60 * 60 * 1000;

export type Mandate = {
  merchant: string;
  agentId: string;
  ceiling: number;
  city: string;
  deliverBy: string;
  expiresAt: string;
  consent: boolean;
  nonce: string;
  note: string;
};

export type Admission = {
  agentId: string;
  agentName: string;
  mandateId: string;
  tokenRef: string;
  rail: "paypal-authorize";
  reason: string;
};

export type Gate =
  | { ok: true; admission: Admission; mandate: Mandate }
  | { ok: false; reason: string; claimedBy?: string };

type RegisteredAgent = {
  name: string;
  /** The Ed25519 public key, as a base64url JWK `x` value. */
  publicKey: string;
};

const REGISTRY: Record<string, RegisteredAgent> = {
  agt_juniper_household: { name: "Juniper", publicKey: "HNbta1CFJcqxccOLQi3TBEtCLGghhv-l_RnAi2ozBDA" },
  agt_northwind: { name: "Northwind", publicKey: "MTbHAkDTEok7zZnF_3fa6AJRZMGczvX5dgmsyPUsSBY" },
  agt_atelier: { name: "Atelier", publicKey: "8Swcb-z-PAC6bRoAuc7vkRCazFS-fo2YOu33-b0xPB8" },
};

/** A registered name found in free text. Display only: it admits nobody. */
export function agentNamedIn(text: string) {
  const q = text.toLowerCase();
  return Object.values(REGISTRY).find((agent) => q.includes(agent.name.toLowerCase()))?.name ?? null;
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

const nonceStore = globalThis as unknown as { __marlowNonces?: Map<string, number> };

/** Global, not per shop: a mandate replayed against a new shop is still a replay. */
function nonces() {
  nonceStore.__marlowNonces ??= new Map();
  return nonceStore.__marlowNonces;
}

function consumeNonce(key: string, expires: number, now: number) {
  const seen = nonces();
  for (const [stored, until] of seen) {
    if (until < now) seen.delete(stored);
  }
  if (seen.has(key)) return false;
  seen.set(key, expires);
  return true;
}

function decodeJson(segment: string): unknown {
  try {
    return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function asMandate(value: unknown): Mandate | null {
  if (!value || typeof value !== "object") return null;
  const claims = value as Partial<Mandate>;
  const strings = [claims.merchant, claims.agentId, claims.city, claims.deliverBy, claims.expiresAt, claims.nonce];
  if (strings.some((item) => typeof item !== "string" || !item)) return null;
  if (typeof claims.consent !== "boolean") return null;
  if (typeof claims.ceiling !== "number" || !Number.isFinite(claims.ceiling) || claims.ceiling <= 0) return null;
  if (claims.note !== undefined && typeof claims.note !== "string") return null;
  if (Number.isNaN(Date.parse(claims.deliverBy as string)) || Number.isNaN(Date.parse(claims.expiresAt as string))) {
    return null;
  }
  return { ...(claims as Mandate), note: claims.note ?? "" };
}

function signatureHolds(publicKey: string, signingInput: string, signature: Buffer) {
  const key = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: publicKey }, format: "jwk" });
  return verify(null, Buffer.from(signingInput), key, signature);
}

const refuse = (reason: string, claimedBy?: string): Gate => ({ ok: false, reason, claimedBy });

/**
 * Decides one presented mandate. A valid mandate spends its nonce here,
 * whatever happens to the sale after, so one mandate is one attempt.
 */
export function admit(token: string, now = Date.now()): Gate {
  const malformed = "The mandate is not a signed mandate this shop can read.";
  if (token.length > MAX_TOKEN_LENGTH) return refuse(malformed);
  const [header, payload, encodedSignature, extra] = token.split(".");
  if (!header || !payload || !encodedSignature || extra !== undefined) return refuse(malformed);
  if ((decodeJson(header) as { alg?: string } | null)?.alg !== "EdDSA") return refuse(malformed);
  const mandate = asMandate(decodeJson(payload));
  if (!mandate) return refuse(malformed);

  const claimed = displayName(mandate.agentId);
  if (containsPan(`${mandate.note} ${mandate.city} ${mandate.agentId}`)) {
    return refuse(
      "A card number was presented. This shop does not take a PAN. A registered agent brings a bound token, or it does not buy.",
      claimed,
    );
  }
  const known = Object.hasOwn(REGISTRY, mandate.agentId) ? REGISTRY[mandate.agentId] : null;
  if (!known) {
    return refuse(`${claimed} is not a registered agent. An unknown session does not get to move the mill.`, claimed);
  }
  if (!signatureHolds(known.publicKey, `${header}.${payload}`, Buffer.from(encodedSignature, "base64url"))) {
    return refuse(
      `The signature does not match ${known.name}'s registered key. The mandate was altered, or it was never theirs.`,
    );
  }

  // Everything below this line is the signer's own word, so it can be trusted.
  if (!mandate.consent) {
    return refuse("There is no consent to pay. Intent without consent is not a mandate.", known.name);
  }
  if (mandate.merchant !== MERCHANT) {
    return refuse(`This mandate was signed for ${mandate.merchant}, not for this shop.`, known.name);
  }
  const expires = Date.parse(mandate.expiresAt);
  if (expires <= now) {
    return refuse(`This mandate expired at ${mandate.expiresAt}. Ask ${known.name} to sign a new one.`, known.name);
  }
  if (expires - now > MAX_LIFETIME_MS) {
    return refuse("This mandate runs for more than 24 hours. The shop accepts short mandates only.", known.name);
  }
  if (!consumeNonce(`${mandate.agentId}:${mandate.nonce}`, expires, now)) {
    return refuse("This mandate was already used. Each signed mandate works once.", known.name);
  }

  const fingerprint = createHash("sha256").update(encodedSignature).digest("hex");
  const mandateId = `mdt_${fingerprint.slice(0, 12)}`;
  return {
    ok: true,
    mandate,
    admission: {
      agentId: mandate.agentId,
      agentName: known.name,
      mandateId,
      tokenRef: `tok_${mandate.agentId}_${fingerprint.slice(0, 8)}`,
      rail: "paypal-authorize",
      reason: `${known.name} is registered and signed mandate ${mandateId} for ${mandate.city}, ceiling $${mandate.ceiling.toLocaleString("en-US")}. PayPal may hold the deposit.`,
    },
  };
}
