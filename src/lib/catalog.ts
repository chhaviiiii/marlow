import type { FloorEvent, LedgerRow, Piece, TranscriptEntry } from "./types";

export const WEEK = "Oct 5-10, 2026";

export const PIECES: Piece[] = [
  {
    id: "desk-walnut",
    name: "Writing desk, walnut",
    wood: "Black walnut",
    size: "54 in",
    price: 840,
    cost: 468,
    leadDays: 11,
    blurb: "A single slab top, eased edge, two drawers. Oil, not lacquer.",
  },
  {
    id: "stool-oak",
    name: "Low stool, white oak",
    wood: "White oak",
    size: "18 in",
    price: 220,
    cost: 96,
    leadDays: 4,
    blurb: "Three legs, a scooped seat. Has an unpaid hold on Thursday's mill.",
  },
  {
    id: "table-walnut",
    name: "Dining table, walnut",
    wood: "Black walnut",
    size: "84 in",
    price: 2400,
    cost: 1280,
    leadDays: 21,
    blurb: "Seats eight. Northwind already has the leaf.",
  },
  {
    id: "chair-leather",
    name: "Leather sling chair",
    wood: "White oak",
    size: "one",
    price: 640,
    cost: 310,
    leadDays: 9,
    blurb: "Oak frame, vegetable-tan sling. Deposit authorized, not yet captured.",
  },
  {
    id: "bedside-oak",
    name: "Bedside, white oak",
    wood: "White oak",
    size: "22 in",
    price: 480,
    cost: 210,
    leadDays: 8,
    blurb: "One drawer, a recessed pull cut from the same board.",
  },
  {
    id: "bench-elm",
    name: "Bench, elm",
    wood: "Elm",
    size: "60 in",
    price: 720,
    cost: 340,
    leadDays: 10,
    blurb: "For the foot of a bed, or for sitting in a hall.",
  },
  {
    id: "shelf-walnut",
    name: "Wall shelf, walnut",
    wood: "Black walnut",
    size: "36 in",
    price: 260,
    cost: 90,
    leadDays: 5,
    blurb: "Shipped last week.",
  },
  {
    id: "daybed-oak",
    name: "Daybed frame, white oak",
    wood: "White oak",
    size: "78 in",
    price: 1680,
    cost: 890,
    leadDays: 18,
    blurb: "Frame only, no mattress. For a room with more than one use.",
  },
];

export const RESOURCES = [
  { id: "mill", name: "Mill", role: "Slab & leg" },
  { id: "bench", name: "Bench", role: "Joinery" },
  { id: "finish", name: "Finish", role: "Oil & wax" },
  { id: "van", name: "Van", role: "Austin" },
] as const;

export function deskPiece() {
  const piece = PIECES.find((item) => item.id === "desk-walnut");
  if (!piece) throw new Error("Missing desk");
  return piece;
}

export function initialEvents(): FloorEvent[] {
  return [
    {
      id: "table-mill",
      resourceId: "mill",
      name: "Dining table: captured",
      start: "2026-10-05T08:00:00-05:00",
      end: "2026-10-06T16:00:00-05:00",
      status: "committed",
      orderId: "HIST-TABLE",
    },
    {
      id: "chair-bench",
      resourceId: "bench",
      name: "Sling chair: authorized",
      start: "2026-10-06T09:00:00-05:00",
      end: "2026-10-07T15:00:00-05:00",
      status: "authorized",
      orderId: "HIST-CHAIR",
    },
    {
      id: "table-finish",
      resourceId: "finish",
      name: "Dining table: oil",
      start: "2026-10-07T08:00:00-05:00",
      end: "2026-10-07T18:00:00-05:00",
      status: "committed",
      orderId: "HIST-TABLE",
    },
    {
      id: "stool-mill",
      resourceId: "mill",
      name: "Stool: hold, unpaid",
      start: "2026-10-08T08:00:00-05:00",
      end: "2026-10-08T18:00:00-05:00",
      status: "held",
      orderId: "HIST-STOOL",
    },
    {
      id: "stool-finish",
      resourceId: "finish",
      name: "Stool: blocked",
      start: "2026-10-08T08:00:00-05:00",
      end: "2026-10-08T18:00:00-05:00",
      status: "blocked",
      orderId: "HIST-STOOL",
    },
  ];
}

export function initialLedger(): LedgerRow[] {
  return [
    {
      id: "led-shelf",
      at: "2026-09-28T11:00:00-05:00",
      agent: "Atelier",
      piece: "Wall shelf, walnut",
      city: "Austin",
      gross: 260,
      deposit: 104,
      captured: 260,
      refunded: 0,
      margin: 0.654,
      status: "Captured",
      paypalOrderId: "HIST-SHELF",
    },
    {
      id: "led-table",
      at: "2026-10-02T15:10:00-05:00",
      agent: "Northwind",
      piece: "Dining table, walnut",
      city: "Dallas",
      gross: 2400,
      deposit: 960,
      captured: 2400,
      refunded: 0,
      margin: 0.467,
      status: "Captured",
      paypalOrderId: "HIST-TABLE",
    },
    {
      id: "led-chair",
      at: "2026-10-04T09:40:00-05:00",
      agent: "Atelier",
      piece: "Leather sling chair",
      city: "Austin",
      gross: 640,
      deposit: 256,
      captured: 0,
      refunded: 0,
      margin: 0.516,
      status: "Authorized",
      paypalOrderId: "HIST-CHAIR",
    },
    {
      id: "led-stool",
      at: "2026-10-05T08:05:00-05:00",
      agent: "Juniper",
      piece: "Low stool, white oak",
      city: "Austin",
      gross: 220,
      deposit: 88,
      captured: 0,
      refunded: 0,
      margin: 0.564,
      status: "Hold expiring",
      paypalOrderId: "HIST-STOOL",
    },
  ];
}

export function initialTranscript(): TranscriptEntry[] {
  return [
    {
      id: "clerk-ready",
      role: "clerk",
      who: "Agent",
      text: "Ask for any piece. Shop policy sets the price, and PayPal holds the deposit for a registered agent with a signed mandate.",
    },
  ];
}
