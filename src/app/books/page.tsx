"use client";

import dynamic from "next/dynamic";
import { useShop } from "@/components/use-shop";
import { usd } from "@/lib/format";

const BooksStudio = dynamic(() => import("@/components/books-studio"), {
  ssr: false,
  loading: () => <p className="loading">Opening the books…</p>,
});

export default function BooksPage() {
  const { shop, error } = useShop();
  if (error) return <p className="page" role="alert">{error}</p>;
  if (!shop) return <p className="page loading">Opening the books…</p>;
  const sum = (key: "gross" | "deposit" | "captured" | "refunded") =>
    shop.ledger.reduce((total, row) => total + row[key], 0);
  const tiles = [
    ["Gross booked", usd(sum("gross"))],
    ["Deposits held", usd(sum("deposit"))],
    ["Captured", usd(sum("captured"))],
    ["Refunded", usd(sum("refunded"))],
  ];
  return (
    <div className="page books-page">
      <header className="top">
        <div>
          <h1>Books</h1>
          <p className="lede">
            Every PayPal authorization, capture, and refund lands in this ledger. Ask the AI assistant to redraw it.
          </p>
          <p className="credit">AI dashboard in AG Studio</p>
        </div>
        <dl className="tiles">
          {tiles.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </header>
      <BooksStudio key={shop.version} shop={shop} />
    </div>
  );
}
