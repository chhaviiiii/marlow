import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { AgentLink } from "@/components/agent-link";
import { PayoutLimit } from "@/components/payout-limit";
import { percent, usd } from "@/lib/format";
import { publicOrigin } from "@/server/mcp";
import { findMerchant, publicShop } from "@/server/merchants";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const merchant = findMerchant((await params).id);
  return { title: merchant ? `${merchant.name} · Marlow` : "Shop not found · Marlow" };
}

export default async function MerchantPage({ params }: Props) {
  const merchant = findMerchant((await params).id);
  if (!merchant) notFound();
  const shop = publicShop(merchant);
  const origin = publicOrigin(new Request("http://localhost/", { headers: await headers() }));

  return (
    <div className="page">
      <header className="top">
        <div>
          <h1>{shop.name}</h1>
          <p className="lede">
            {shop.city}. {shop.pieces.length} {shop.pieces.length === 1 ? "piece" : "pieces"}. An agent quotes these
            prices exactly, and a person approves a {percent(shop.depositRatio)} deposit.
          </p>
        </div>
      </header>
      <div className="shop-sheets">
        <section aria-labelledby="price-book">
          <h2 id="price-book" className="sheet-title">Price book</h2>
          <div className="table-scroll" tabIndex={0} role="region" aria-labelledby="price-book">
            <table className="shop-book">
              <thead>
                <tr>
                  <th scope="col">Piece</th>
                  <th scope="col" className="amount">Lead days</th>
                  <th scope="col" className="amount">Price</th>
                  <th scope="col" className="amount">Deposit</th>
                </tr>
              </thead>
              <tbody>
                {shop.pieces.map((piece) => (
                  <tr key={piece.id}>
                    <th scope="row">{piece.name}</th>
                    <td className="amount">{piece.leadDays}</td>
                    <td className="amount">{usd(piece.price)}</td>
                    <td className="amount">{usd(piece.price * shop.depositRatio)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section aria-labelledby="connect" className="shop-connect">
          <h2 id="connect" className="sheet-title">Connect an agent</h2>
          <AgentLink id={shop.id} mcpUrl={`${origin}/api/mcp/${shop.id}`} origin={origin} />
          <PayoutLimit merchant={shop.name} />
          <p className="fine">
            This shop lives in server memory. A restart removes it, and so does the cap of 200 shops, which drops the
            one idle longest.
          </p>
        </section>
      </div>
    </div>
  );
}
