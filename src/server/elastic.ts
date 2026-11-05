import { Client } from "@elastic/elasticsearch";
import type { Piece } from "@/lib/types";

function tokens(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2);
}

export function scorePiece(piece: Piece, query: string) {
  const wanted = tokens(query);
  const hay = tokens(`${piece.name} ${piece.wood} ${piece.blurb} ${piece.size}`);
  if (!wanted.length) return 1;
  let score = 0;
  for (const token of wanted) {
    if (hay.includes(token)) score += 3;
    else if (hay.some((word) => word.startsWith(token) || token.startsWith(word))) score += 1;
  }
  return score;
}

export function searchLocal(pieces: Piece[], query: string) {
  return [...pieces]
    .map((piece) => ({ piece, score: scorePiece(piece, query) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);
}

function elasticClient() {
  const node = process.env.ELASTIC_URL;
  if (!node) return null;
  return new Client({
    node,
    auth: process.env.ELASTIC_API_KEY
      ? { apiKey: process.env.ELASTIC_API_KEY }
      : undefined,
  });
}

export async function searchCatalog(pieces: Piece[], query: string) {
  const client = elasticClient();
  if (!client) {
    return {
      engine: "embedded" as const,
      hits: searchLocal(pieces, query),
      note: "Matched on name, wood, and description.",
    };
  }
  try {
    const index = "marlow-catalog";
    const exists = await client.indices.exists({ index });
    if (!exists) {
      await client.indices.create({
        index,
        mappings: {
          properties: {
            name: { type: "text" },
            wood: { type: "keyword" },
            blurb: { type: "text" },
            price: { type: "float" },
          },
        },
      });
      await client.bulk({
        refresh: true,
        operations: pieces.flatMap((piece) => [
          { index: { _index: index, _id: piece.id } },
          piece,
        ]),
      });
    }
    const result = await client.search<{ name: string }>({
      index,
      size: 6,
      query: {
        multi_match: {
          query,
          fields: ["name^3", "wood^2", "blurb"],
        },
      },
    });
    const ids = result.hits.hits.map((hit) => hit._id).filter(Boolean) as string[];
    const hits = ids
      .map((id) => pieces.find((piece) => piece.id === id))
      .filter((piece): piece is Piece => Boolean(piece))
      .map((piece, index) => ({ piece, score: 10 - index }));
    return {
      engine: "elastic" as const,
      hits: hits.length ? hits : searchLocal(pieces, query),
      note: "Elasticsearch multi_match on name, wood, and blurb.",
    };
  } catch (error) {
    return {
      engine: "embedded" as const,
      hits: searchLocal(pieces, query),
      note: `Elasticsearch was configured but unreachable (${error instanceof Error ? error.message : "error"}). Used the embedded index.`,
    };
  }
}
