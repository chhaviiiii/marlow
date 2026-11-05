export type PayPalMode = "live" | "rehearsal";

export type FloorStatus =
  | "held"
  | "blocked"
  | "authorized"
  | "committed"
  | "released";

export type Phase = "idle" | "quoted" | "authorized" | "captured" | "refunded";

export type Piece = {
  id: string;
  name: string;
  wood: string;
  size: string;
  price: number;
  cost: number;
  leadDays: number;
  blurb: string;
};

export type FloorEvent = {
  id: string;
  resourceId: "mill" | "bench" | "finish" | "van";
  name: string;
  start: string;
  end: string;
  status: FloorStatus;
  orderId?: string;
};

export type LedgerRow = {
  id: string;
  at: string;
  agent: string;
  piece: string;
  city: string;
  gross: number;
  deposit: number;
  captured: number;
  refunded: number;
  margin: number;
  status: string;
  paypalOrderId: string;
};

export type TranscriptEntry = {
  id: string;
  role: "buyer" | "clerk" | "trace" | "note";
  who?: string;
  text: string;
  tool?: string;
  ok?: boolean;
  sample?: boolean;
  via?: "model" | "rules";
};

export type Comp = {
  title: string;
  price: number;
  merchant: string;
  url?: string;
  source: "channel3" | "fixture";
};

export type Admission = {
  agentId: string;
  agentName: string;
  mandateId: string;
  tokenRef: string;
  rail: "paypal-authorize";
  reason: string;
};

export type Quote = {
  pieceId: string;
  pieceName: string;
  buyer: string;
  city: string;
  gross: number;
  deposit: number;
  balance: number;
  margin: number;
  ship: string;
  ceiling: number;
};

export type PayPalRecord = {
  mode: PayPalMode;
  orderId: string;
  authorizationId?: string;
  captureId?: string;
  refundId?: string;
  invoiceId?: string;
  status: string;
};

export type Integration = {
  name: string;
  state: string;
  detail: string;
};

export type ShopSnapshot = {
  version: number;
  mode: PayPalMode;
  llm: boolean;
  model: string;
  paypalClientId: string | null;
  merchant: {
    name: string;
    place: string;
    week: string;
  };
  phase: Phase;
  pieces: Piece[];
  events: FloorEvent[];
  ledger: LedgerRow[];
  transcript: TranscriptEntry[];
  quote: Quote | null;
  admission: Admission | null;
  paypal: PayPalRecord | null;
  comps: Comp[];
  integrations: Integration[];
};

export type ActionResult = {
  shop: ShopSnapshot;
  added: number;
};
