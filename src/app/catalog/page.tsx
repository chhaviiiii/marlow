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
  const [problem, setProblem] = useState<string | null>(null);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    setProblem(null);
    try {
      const res = await fetch("/api/catalog/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query }),
      });
      if (!res.ok) throw new Error(`Search returned ${res.status}`);
      const data = (await res.json()) as { pieces: Piece[]; note: string; engine: string };
      setPieces(data.pieces);
      const count = data.pieces.length;
      const label = count === 1 ? "piece" : "pieces";
      setNote(data.engine === "elastic" ? `Elasticsearch · ${count} ${label}` : `${count} ${label} in the shop`);
    } catch {
      setProblem("The search did not go through. Try again.");
    }
  }

  if (error) return <p className="page" role="alert">{error}</p>;
  if (!shop) return <p className="page">Opening the catalog…</p>;
  const shown = pieces ?? shop.pieces;

  return (
    <div className="page">
      <header className="top">
        <div>
          <h1>What an agent can buy</h1>
          <p className="lede">Eight pieces, each priced by the maker. The agent quotes these numbers exactly.</p>
        </div>
        <p className="credit">Catalog search in Elastic</p>
      </header>
      <form className="search" onSubmit={search}>
        <input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search the catalog" />
        <button className="secondary" type="submit">Search</button>
      </form>
      <p className="fine live-note" role="status">{note}</p>
      <p className="fine error live-note" role="alert">{problem}</p>
      <div className="price-book">
        <div className="book-cols" aria-hidden>
          <span />
          <span>Piece</span>
          <span>Wood and size</span>
          <span className="margin-col">Margin</span>
          <span className="amount">Price</span>
          <span />
        </div>
        {shown.map((piece) => (
          <article key={piece.id} className="piece">
            <PieceMark id={piece.id} />
            <div className="piece-title">
              <h2>{piece.name}</h2>
              <p>{piece.blurb}</p>
            </div>
            <p className="piece-spec">{piece.wood} · {piece.size}</p>
            <p className="piece-margin">{percent((piece.price - piece.cost) / piece.price)} margin</p>
            <div className="price">{usd(piece.price)}</div>
            <Link className="card-ask" href={`/?ask=${encodeURIComponent(`Quote the ${piece.name.toLowerCase()} for Juniper`)}`}>
              Ask the agent <ArrowUpRight size={14} />
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}
