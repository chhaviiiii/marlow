"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { percent, usd } from "@/lib/format";
import { PieceMark } from "@/components/piece-mark";
import { useShop } from "@/components/use-shop";
import type { Piece } from "@/lib/types";

export default function CatalogPage() {
  const { shop, error } = useShop();
  const [query, setQuery] = useState("walnut desk");
  const [pieces, setPieces] = useState<Piece[] | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    const res = await fetch("/api/catalog/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query }),
    });
    const data = (await res.json()) as { pieces: Piece[]; note: string; engine: string };
    setPieces(data.pieces);
    const count = data.pieces.length;
    const label = count === 1 ? "piece" : "pieces";
    setNote(data.engine === "elastic" ? `Elasticsearch · ${count} ${label}` : `${count} ${label} in the shop`);
  }

  if (error) return <p className="page">{error}</p>;
  if (!shop) return <p className="page">Opening the catalog…</p>;
  const shown = pieces ?? shop.pieces;

  return (
    <div className="page">
      <header className="top" style={{ paddingLeft: 0, paddingRight: 0 }}>
        <div>
          <p className="kicker">Catalog · Elastic search</p>
          <h1>What an agent can buy</h1>
          <p className="lede">Eight pieces, each priced by the maker. The agent quotes these numbers exactly.</p>
        </div>
      </header>
      <form className="search" onSubmit={search}>
        <input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search the catalog" />
        <button className="secondary" type="submit">Search</button>
      </form>
      {note && <p className="fine">{note}</p>}
      <div className="catalog-grid">
        {shown.map((piece) => (
          <article key={piece.id} className="card">
            <PieceMark id={piece.id} />
            <h3>{piece.name}</h3>
            <p>{piece.blurb}</p>
            <div className="price">{usd(piece.price)}</div>
            <p className="fine">{piece.wood} · {piece.size} · margin {percent((piece.price - piece.cost) / piece.price)}</p>
            <Link className="card-ask" href={`/?ask=${encodeURIComponent(`Quote the ${piece.name.toLowerCase()} for Juniper`)}`}>
              Ask the agent <ArrowUpRight size={14} />
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}
