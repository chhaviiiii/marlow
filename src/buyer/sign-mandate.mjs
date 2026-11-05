/**
 * Buyer-side signing. Runs in a browser and in Node, because it uses only
 * WebCrypto. A mandate is a compact JWS (EdDSA), so any JOSE library in any
 * language can produce one. The signature covers the exact bytes sent, so no
 * shared canonical form is needed.
 */

export const MERCHANT = "field-and-grain";
const LIFETIME_MS = 10 * 60 * 1000;

function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const encodeJson = (value) => base64url(new TextEncoder().encode(JSON.stringify(value)));

/** The terms a buyer signs. The nonce is fresh, so each mandate works once. */
export function mandateTerms(buyer, overrides = {}) {
  return {
    merchant: MERCHANT,
    agentId: buyer.agentId,
    ceiling: buyer.ceiling,
    city: buyer.city,
    deliverBy: buyer.deliverBy,
    expiresAt: new Date(Date.now() + LIFETIME_MS).toISOString(),
    consent: true,
    nonce: crypto.randomUUID(),
    note: buyer.note,
    ...overrides,
  };
}

export async function signTerms(jwk, terms) {
  if (!globalThis.crypto?.subtle) {
    throw new Error("This page cannot sign. WebCrypto needs https or localhost.");
  }
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "Ed25519" }, false, ["sign"]);
  const signingInput = `${encodeJson({ alg: "EdDSA", typ: "marlow-mandate+jwt" })}.${encodeJson(terms)}`;
  const signature = await crypto.subtle.sign({ name: "Ed25519" }, key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64url(new Uint8Array(signature))}`;
}

export function signMandate(buyer, overrides) {
  return signTerms(buyer.jwk, mandateTerms(buyer, overrides));
}
