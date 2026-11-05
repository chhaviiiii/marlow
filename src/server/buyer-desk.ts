import { randomUUID } from "node:crypto";
import { PIECES } from "@/lib/catalog";
import type { ShopSnapshot } from "@/lib/types";
import { admit } from "./agent-pay";
import type { BuyerDesk } from "./mcp";
import type { Merchant } from "./merchants";
import {
  dropShop,
  getShop,
  hasShop,
  openMerchantShop,
  quoteForAgent,
  searchForAgent,
  searchMerchantForAgent,
} from "./shop";
import { inShop } from "./visitor";

/**
 * An outside agent has no cookie, so each accepted mandate opens its own shop,
 * keyed by a random order id. One mandate, one shop, one order. Agents cannot
 * see each other or any browser's shop. A refused mandate opens nothing, so a
 * stranger cannot push real shops out of the store.
 */

const ORDER_ID = /^ord_[0-9a-f-]{36}$/;

const STATUS: Record<ShopSnapshot["phase"], string> = {
  idle: "no_quote",
  quoted: "awaiting_buyer_approval",
  authorized: "deposit_held",
  captured: "deposit_captured",
  refunded: "refunded",
};

export function isOrderId(id: string) {
  return ORDER_ID.test(id);
}

function orderView(shop: ShopSnapshot, orderId: string, origin: string) {
  const quote = shop.quote;
  return {
    status: STATUS[shop.phase],
    order_id: orderId,
    merchant: shop.merchant.id ? shop.merchant.name : undefined,
    buyer: quote?.buyer,
    mandate_id: shop.admission?.mandateId,
    piece_id: quote?.pieceId,
    piece: quote?.pieceName,
    city: quote?.city,
    ceiling: quote?.ceiling,
    price: quote?.gross,
    deposit: quote?.deposit,
    balance_on_delivery: quote?.balance,
    ships: quote?.ship,
    paypal_mode: shop.mode === "live" ? "sandbox" : "rehearsal",
    paypal_order_id: shop.paypal?.orderId,
    paypal_authorization_id: shop.paypal?.authorizationId,
    approval_url: shop.phase === "quoted" ? `${origin}/approve/${orderId}` : undefined,
    next_step:
      shop.phase === "quoted"
        ? "Give approval_url to your person. They approve the deposit. No agent tool can do this."
        : undefined,
  };
}

export function orderStatus(orderId: string, origin: string) {
  if (!isOrderId(orderId)) return null;
  return inShop(orderId, () => (hasShop() ? orderView(getShop(), orderId, origin) : null));
}

/** The same read, for an MCP endpoint. An order is visible only on the shop that took it. */
function orderOnDesk(orderId: string, origin: string, merchantId?: string) {
  if (!isOrderId(orderId)) return null;
  return inShop(orderId, () => {
    if (!hasShop()) return null;
    const shop = getShop();
    return shop.merchant.id === merchantId ? orderView(shop, orderId, origin) : null;
  });
}

function deskFor(merchant?: Merchant): BuyerDesk {
  return {
    shop: merchant && { merchant_id: merchant.id, name: merchant.name, city: merchant.city },

    search: async (query) => (merchant ? searchMerchantForAgent(merchant, query) : searchForAgent(query)),

    async requestQuote(mandate, pieceId, origin) {
      if (!(merchant?.pieces ?? PIECES).some((piece) => piece.id === pieceId)) {
        return { refused: true, body: { status: "refused", reason: `There is no piece with the id ${pieceId}.` } };
      }
      const gate = admit(mandate, Date.now(), merchant?.id);
      if (!gate.ok) return { refused: true, body: { status: "refused", reason: gate.reason } };

      const orderId = `ord_${randomUUID()}`;
      return inShop(orderId, async () => {
        if (merchant) openMerchantShop(merchant);
        const { shop } = await quoteForAgent(pieceId, gate);
        if (shop.phase !== "quoted") {
          const reason = shop.transcript.at(-1)?.text;
          dropShop();
          return { refused: true, body: { status: "refused", reason } };
        }
        return { refused: false, body: orderView(shop, orderId, origin) };
      });
    },

    orderStatus(orderId, origin) {
      const view = orderOnDesk(orderId, origin, merchant?.id);
      return view
        ? { refused: false, body: view }
        : { refused: true, body: { status: "refused", reason: "There is no order with that id." } };
    },
  };
}

export const buyerDesk = deskFor();

export const merchantDesk = (merchant: Merchant) => deskFor(merchant);
