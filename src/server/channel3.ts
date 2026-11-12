import type { Comp } from "@/lib/types";

const FIXTURES: Comp[] = [
  { title: "Article walnut writing desk", price: 790, merchant: "West Elm", source: "fixture" },
  { title: "Campaign desk, walnut", price: 960, merchant: "Schoolhouse", source: "fixture" },
  { title: "Writing table, solid walnut", price: 1180, merchant: "Design Within Reach", source: "fixture" },
  { title: "Secretary desk, walnut", price: 1240, merchant: "Rejuvenation", source: "fixture" },
];

type ChannelProduct = {
  title?: string;
  name?: string;
  brand?: { name?: string } | string;
  merchant?: string;
  url?: string;
  price?: number | { price?: number; value?: number; amount?: number };
  offers?: { price?: number; merchant?: string; url?: string }[];
};

function readPrice(product: ChannelProduct) {
  const raw = product.price;
  if (typeof raw === "number") return raw;
  if (raw && typeof raw === "object") {
    return raw.price ?? raw.value ?? raw.amount ?? product.offers?.[0]?.price ?? 0;
  }
  return product.offers?.[0]?.price ?? 0;
}

function readMerchant(product: ChannelProduct) {
  if (typeof product.brand === "string") return product.brand;
  if (product.brand?.name) return product.brand.name;
  return product.merchant || product.offers?.[0]?.merchant || "Market";
}

export async function findComps(query: string): Promise<{ comps: Comp[]; live: boolean; note: string }> {
  const key = process.env.CHANNEL3_API_KEY;
  if (!key) {
    return {
      comps: FIXTURES,
      live: false,
      note: "Channel3 key not set. The quote uses fixture comps in the same shape the API returns.",
    };
  }
  const res = await fetch("https://api.trychannel3.com/v1/search", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
    },
    body: JSON.stringify({
      query,
      limit: 4,
      config: { mode: "agentic" },
    }),
  });
  if (!res.ok) {
    return {
      comps: FIXTURES,
      live: false,
      note: `Channel3 returned ${res.status}. Fell back to the fixture so the sale can continue.`,
    };
  }
  const json = (await res.json()) as { products?: ChannelProduct[] };
  const comps = (json.products ?? [])
    .map((product) => ({
      title: product.title || product.name || "Untitled listing",
      price: Number(readPrice(product)) || 0,
      merchant: readMerchant(product),
      url: product.url || product.offers?.[0]?.url,
      source: "channel3" as const,
    }))
    .filter((comp) => comp.price > 0)
    .slice(0, 4);
  if (!comps.length) {
    return { comps: FIXTURES, live: false, note: "Channel3 returned no priced comps. Using the fixture." };
  }
  return { comps, live: true, note: "Comps came from Channel3." };
}
