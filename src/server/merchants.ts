import { randomBytes } from "node:crypto";
import type { MerchantSetup } from "../lib/merchant-sheet";
import type { Piece, ShopPolicy } from "../lib/types";

/**
 * Shops made on /setup. They live in this process's memory, like every other
 * shop here, so a restart loses them and the cap evicts the one idle longest.
 * The store holds only what a merchant typed on /setup, and nothing logs it.
 */

export const MAX_MERCHANTS = 200;

const MERCHANT_ID = /^m_[0-9a-f]{16}$/;

export type Merchant = {
  id: string;
  name: string;
  city: string;
  policy: ShopPolicy;
  pieces: Piece[];
};

const store = globalThis as unknown as { __marlowMerchants?: Map<string, Merchant> };

function merchants() {
  store.__marlowMerchants ??= new Map();
  return store.__marlowMerchants;
}

export function createMerchant(setup: MerchantSetup) {
  const merchant: Merchant = {
    id: `m_${randomBytes(8).toString("hex")}`,
    name: setup.name,
    city: setup.city,
    policy: {
      depositRatio: setup.depositRatio,
      minMargin: setup.minMargin,
      captureOn: "ship",
      currency: "USD",
      calendar: "live",
    },
    pieces: setup.rows.map(({ id, name, price, cost, leadDays }) => ({
      id,
      name,
      price,
      cost,
      leadDays,
      wood: "",
      size: "",
      blurb: "",
    })),
  };
  const all = merchants();
  all.set(merchant.id, merchant);
  if (all.size > MAX_MERCHANTS) {
    const oldest = all.keys().next().value;
    if (oldest) all.delete(oldest);
  }
  return merchant;
}

/** Re-inserts on each read, so the shop idle longest is the first one evicted. */
export function findMerchant(id: string) {
  if (!MERCHANT_ID.test(id)) return null;
  const all = merchants();
  const merchant = all.get(id);
  if (!merchant) return null;
  all.delete(id);
  all.set(id, merchant);
  return merchant;
}

/** What the public shop page may show. Cost and the margin floor stay on the server. */
export function publicShop(merchant: Merchant) {
  return {
    id: merchant.id,
    name: merchant.name,
    city: merchant.city,
    depositRatio: merchant.policy.depositRatio,
    pieces: merchant.pieces.map(({ id, name, price, leadDays }) => ({ id, name, price, leadDays })),
  };
}
