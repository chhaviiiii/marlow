function money(n: number) {
  return Math.round(n * 100) / 100;
}

function dollars(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type PricedPiece = {
  name: string;
  price: number;
  cost: number;
};

/** The maker's rule. The model may propose. Only this function may price. */
export const POLICY = {
  depositRatio: 0.4,
  minMargin: 0.08,
  captureOn: "ship" as const,
  currency: "USD",
};

export type QuoteRequest = {
  ceiling: number;
  needBy: string;
};

export type QuoteDecision =
  | {
      ok: true;
      gross: number;
      deposit: number;
      balance: number;
      margin: number;
      reason: string;
    }
  | { ok: false; reason: string };

export function quotePiece(piece: PricedPiece, request: QuoteRequest): QuoteDecision {
  const margin = (piece.price - piece.cost) / piece.price;
  if (piece.price > request.ceiling) {
    return {
      ok: false,
      reason: `${piece.name} is ${dollars(piece.price)}, above the buyer's ceiling of ${dollars(request.ceiling)}.`,
    };
  }
  if (margin < POLICY.minMargin) {
    return {
      ok: false,
      reason: `Margin would be under the ${POLICY.minMargin * 100}% floor.`,
    };
  }
  const deposit = money(piece.price * POLICY.depositRatio);
  const balance = money(piece.price - deposit);
  return {
    ok: true,
    gross: piece.price,
    deposit,
    balance,
    margin,
    reason: `Deposit ${Math.round(POLICY.depositRatio * 100)}%. Margin holds. Capture on ${POLICY.captureOn}.`,
  };
}
