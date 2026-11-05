"use client";

import {
  ArrowUpRight,
  Ban,
  CalendarClock,
  Check,
  CreditCard,
  LoaderCircle,
  Lock,
  Receipt,
  Search,
  ShieldCheck,
  ShieldX,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { percent, usd } from "@/lib/format";
import type { ShopSnapshot, TranscriptEntry } from "@/lib/types";
import { PieceMark } from "./piece-mark";
import { useShop } from "./use-shop";

const PHASES = [
  { id: "idle", label: "Ask" },
  { id: "quoted", label: "Quoted" },
  { id: "authorized", label: "Held" },
  { id: "captured", label: "Captured" },
  { id: "refunded", label: "Settled" },
] as const;

const STARTS = [
  {
    pieceId: "desk-walnut",
    title: "Walnut writing desk",
    buyer: "Juniper",
    note: "Austin, before Friday, ceiling $880",
    message: "Walnut writing desk for Juniper, Austin, before Friday, ceiling $880",
  },
  {
    pieceId: "bench-elm",
    title: "Elm bench",
    buyer: "Atelier",
    note: "Studio order, any day this week",
    message: "Quote the elm bench for Atelier",
  },
  {
    pieceId: "stool-oak",
    title: "Anything in white oak",
    buyer: "Browse",
    note: "See what the shop has",
    message: "What do you have in white oak?",
  },
] as const;

const PROBES = [
  { label: "An unregistered agent", message: "Drift wants the walnut writing desk, ceiling $900", icon: ShieldX },
  { label: "A card number", message: "Just charge 4111 1111 1111 1111 for the walnut desk", icon: CreditCard },
] as const;

const BEAT: Record<(typeof PHASES)[number]["id"], string> = {
  idle: "No amount yet.",
  quoted: "PayPal has not held anything yet.",
  authorized: "PayPal is holding the deposit. Capture when the piece ships.",
  captured: "The deposit is captured. The balance is on the invoice.",
  refunded: "Settled. The refund went back through PayPal and the order stands.",
};

type Turn =
  | { kind: "line"; entry: TranscriptEntry }
  | { kind: "checks"; id: string; items: TranscriptEntry[] };

export function Desk() {
  const { shop, error, act, refresh } = useShop();
  const [shown, setShown] = useState(0);
  const [running, setRunning] = useState(false);
  const [brief, setBrief] = useState(() =>
    typeof window === "undefined" ? "" : (new URLSearchParams(window.location.search).get("ask") ?? ""),
  );
  const [payError, setPayError] = useState<string | null>(null);
  const [settled, setSettled] = useState<ShopSnapshot | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const booted = useRef(false);

  if (shop && shown >= shop.transcript.length && settled !== shop) setSettled(shop);

  useEffect(() => {
    if (!shop) return;
    if (!booted.current) {
      booted.current = true;
      setShown(shop.transcript.length);
      return;
    }
    const target = shop.transcript.length;
    const timer = window.setInterval(() => {
      setShown((current) => {
        if (current >= target) {
          window.clearInterval(timer);
          return current;
        }
        return current + 1;
      });
    }, 420);
    return () => window.clearInterval(timer);
  }, [shop?.version]);

  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [shown, running]);

  async function ask(message: string) {
    const trimmed = message.trim();
    if (!trimmed || running) return;
    setBrief("");
    setRunning(true);
    try {
      await act("/api/clerk/ask", { message: trimmed });
    } finally {
      setRunning(false);
    }
  }

  async function run(url: string) {
    if (running) return;
    setRunning(true);
    try {
      await act(url);
    } finally {
      setRunning(false);
    }
  }

  if (error) return <p className="page">{error}</p>;
  if (!shop) return <p className="page loading">Opening the shop…</p>;

  const entries = shop.transcript.slice(0, shown);
  const revealing = shown < shop.transcript.length;
  const busy = running || revealing;
  const view = settled ?? shop;
  const fresh = entries.length <= 1 && view.phase === "idle" && !busy;
  const turns = groupTurns(entries.slice(fresh ? 1 : 0));
  const quote = view.quote;
  const current = PHASES.findIndex((item) => item.id === view.phase);
  const placeholder =
    view.phase === "quoted"
      ? "Ask about the shop. This deposit stays open."
      : view.phase === "authorized"
        ? "Say the van is loaded to capture."
        : view.phase === "captured"
          ? "Ask for the $80 scuff refund."
          : view.phase === "refunded"
            ? "The week is settled. Reset to start again."
            : "Ask for any piece, and say who is buying.";

  return (
    <div className="desk-screen">
      <header className="top desk-top">
        <div>
          <p className="kicker">Field & Grain · Austin · {shop.merchant.week}</p>
          <h1>Agent</h1>
        </div>
        <ol className="stepper" aria-label="Sale progress">
          {PHASES.map((step, index) => {
            const state = index < current || view.phase === "refunded" ? "done" : index === current ? "now" : "";
            return (
              <li key={step.id} className={state}>
                <i>{state === "done" ? <Check size={12} strokeWidth={3} /> : index + 1}</i>
                {step.label}
              </li>
            );
          })}
        </ol>
      </header>
      <div className="desk">
        <div className="conversation">
          <section className="panel thread" aria-label="Conversation">
            <div className="transcript" ref={scroller}>
              {fresh ? (
                <Welcome shop={shop} disabled={busy} onAsk={ask} />
              ) : (
                <>
                  {turns.map((turn) =>
                    turn.kind === "checks" ? (
                      <Checks key={turn.id} items={turn.items} />
                    ) : (
                      <Line key={turn.entry.id} entry={turn.entry} />
                    ),
                  )}
                  {running && (
                    <div className="typing" role="status">
                      <span className="avatar seal-sm">M</span>
                      <span>
                        <LoaderCircle size={14} className="spin" /> Checking the catalog, the market, and the mandate…
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="composer">
              {!fresh && view.phase === "idle" && !busy && (
                <div className="quick">
                  {STARTS.map((start) => (
                    <button key={start.title} type="button" className="chip-btn" onClick={() => ask(start.message)}>
                      {start.buyer === "Browse" ? start.title : `${start.title}, ${start.buyer}`}
                    </button>
                  ))}
                  {PROBES.map((probe) => (
                    <button key={probe.label} type="button" className="chip-btn probe" onClick={() => ask(probe.message)}>
                      {probe.label}
                    </button>
                  ))}
                </div>
              )}
              <form
                className="ask"
                onSubmit={(event) => {
                  event.preventDefault();
                  void ask(brief);
                }}
              >
                <input
                  value={brief}
                  onChange={(event) => setBrief(event.target.value)}
                  placeholder={placeholder}
                  aria-label="Ask the agent"
                  disabled={running}
                />
                <button className="primary" type="submit" disabled={running || !brief.trim()}>
                  {running ? "Working" : "Send"}
                </button>
              </form>
            </div>
          </section>

          <aside className="panel offer" aria-label="PayPal">
            <div className="offer-top">
              <p className="eyebrow">PayPal</p>
              <span className={`mode-tag ${view.mode}`}>{view.mode === "live" ? "Sandbox" : "Rehearsal"}</span>
            </div>
            {quote ? (
              <>
                <div className="offer-head">
                  <PieceMark id={quote.pieceId} />
                  <div>
                    <h2>{usd(quote.deposit)}</h2>
                    <p className="muted">Deposit · {quote.pieceName}</p>
                  </div>
                </div>

                {view.admission && (
                  <div className="mandate">
                    <ShieldCheck size={18} />
                    <div>
                      <b>{view.admission.agentName} · registered agent</b>
                      <span>
                        Mandate {view.admission.mandateId} · ceiling {usd(quote.ceiling)} · no card number
                      </span>
                    </div>
                  </div>
                )}

                {view.phase === "quoted" ? (
                  <>
                    <p className="beat">
                      {view.mode === "live"
                        ? "Approve in PayPal. This holds the deposit and charges nothing yet."
                        : BEAT.quoted}
                    </p>
                    <div className="paypal-box">
                      {view.mode === "rehearsal" && (
                        <button className="primary pay" type="button" disabled={busy} onClick={() => run("/api/paypal/authorize")}>
                          <Lock size={16} /> Hold {usd(quote.deposit)} with PayPal
                        </button>
                      )}
                      {view.mode === "live" && view.paypalClientId && (
                        <LivePayPal
                          clientId={view.paypalClientId}
                          onDone={() => {
                            setPayError(null);
                            refresh().catch(() => setPayError("The shop did not refresh."));
                          }}
                          onError={setPayError}
                        />
                      )}
                      {payError && <p className="fine error">{payError}</p>}
                      <p className="fine">
                        {view.mode === "live" ? "Sign in with a sandbox buyer account. " : ""}
                        {quote.pieceId === "desk-walnut" ? "Approving releases Thursday's mill for this desk." : ""}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="beat">{BEAT[view.phase]}</p>
                    <PaymentSteps shop={view} />
                    {view.phase === "authorized" && (
                      <button className="primary pay" type="button" disabled={busy} onClick={() => run("/api/paypal/capture")}>
                        <Check size={16} /> Capture {usd(quote.deposit)} · van loaded
                      </button>
                    )}
                    {view.phase === "captured" && (
                      <button className="secondary pay" type="button" disabled={busy} onClick={() => run("/api/paypal/refund")}>
                        Refund $80 for a scuff
                      </button>
                    )}
                    {quote.pieceId === "desk-walnut" && (
                      <Link href="/floor" className="floor-link">
                        <CalendarClock size={18} />
                        <span>
                          <b>The floor moved.</b> The desk took Thursday&apos;s mill from the unpaid stool.
                        </span>
                        <ArrowUpRight size={16} />
                      </Link>
                    )}
                  </>
                )}

                <dl className="meta">
                  <div>
                    <dt>Total</dt>
                    <dd>{usd(quote.gross)}</dd>
                  </div>
                  <div>
                    <dt>On delivery</dt>
                    <dd>{usd(quote.balance)}</dd>
                  </div>
                  <div>
                    <dt>Margin</dt>
                    <dd>{percent(quote.margin)}</dd>
                  </div>
                  <div>
                    <dt>Ships</dt>
                    <dd>{quote.ship.replace(", before noon", "")}</dd>
                  </div>
                </dl>
              </>
            ) : (
              <HowItWorks />
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

function Welcome({ shop, disabled, onAsk }: { shop: ShopSnapshot; disabled: boolean; onAsk: (message: string) => void }) {
  return (
    <div className="welcome">
      <span className="avatar seal-lg">M</span>
      <h2>Who is buying today?</h2>
      <p>
        Ask for any piece in plain words. Marlow prices it from shop policy, checks the buyer&apos;s mandate, and asks
        PayPal to hold the deposit.
      </p>
      <div className="start-grid">
        {STARTS.map((start) => {
          const piece = shop.pieces.find((item) => item.id === start.pieceId);
          return (
            <button key={start.title} type="button" className="start" disabled={disabled} onClick={() => onAsk(start.message)}>
              <PieceMark id={start.pieceId} />
              <b>{start.title}</b>
              <span className="start-buyer">{start.buyer === "Browse" ? "Browse the shop" : `for ${start.buyer}`}</span>
              <span className="start-note">{start.note}</span>
              <span className="start-price">
                {start.buyer === "Browse" ? "Search" : piece ? usd(piece.price) : ""}
                <ArrowUpRight size={14} />
              </span>
            </button>
          );
        })}
      </div>
      <div className="probes">
        <span>Try to get past it</span>
        {PROBES.map((probe) => {
          const Icon = probe.icon;
          return (
            <button key={probe.label} type="button" className="chip-btn probe" disabled={disabled} onClick={() => onAsk(probe.message)}>
              <Icon size={14} /> {probe.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Line({ entry }: { entry: TranscriptEntry }) {
  if (entry.role === "note") return <p className="note-line">{entry.text}</p>;
  if (entry.role === "buyer") {
    return (
      <article className="entry buyer">
        <div className="who">{entry.who || "Buyer"}</div>
        <p>{entry.text}</p>
      </article>
    );
  }
  return (
    <article className="entry clerk">
      <span className="avatar seal-sm">M</span>
      <div>
        <div className="who">
          Marlow
          {entry.via === "model" && <span className="via">AI</span>}
        </div>
        <p>{entry.text}</p>
      </div>
    </article>
  );
}

function Checks({ items }: { items: TranscriptEntry[] }) {
  const refused = items.some((item) => item.ok === false);
  return (
    <details className={`checks ${refused ? "refused" : ""}`}>
      <summary>
        <span className="chips">
          {items.map((item) => (
            <span key={item.id} className={`chip ${item.ok === false ? "no" : ""}`}>
              {item.ok === false ? <Ban size={12} /> : <Check size={12} strokeWidth={3} />}
              {item.tool ?? "Shop"}
            </span>
          ))}
        </span>
        <span className="checks-more">Details</span>
      </summary>
      <div className="check-list">
        {items.map((item) => (
          <p className="check" key={item.id}>
            <span>{item.tool ?? "Shop"}</span>
            {item.text}
          </p>
        ))}
      </div>
    </details>
  );
}

function PaymentSteps({ shop }: { shop: ShopSnapshot }) {
  const quote = shop.quote;
  const paypal = shop.paypal;
  if (!quote || !paypal) return null;
  const steps = [
    { label: "Held", amount: quote.deposit, id: paypal.authorizationId, done: true },
    { label: "Captured", amount: quote.deposit, id: paypal.captureId, done: Boolean(paypal.captureId) },
    { label: "Refunded", amount: 80, id: paypal.refundId, done: Boolean(paypal.refundId) },
  ];
  return (
    <ol className="pay-steps">
      {steps.map((step) => (
        <li key={step.label} className={step.done ? "done" : ""}>
          <i>{step.done ? <Check size={12} strokeWidth={3} /> : null}</i>
          <span>
            <b>{step.label}</b>
            <small>{step.id ?? "—"}</small>
          </span>
          <em>{usd(step.amount)}</em>
        </li>
      ))}
      <li className="order-id">
        <span>
          Order <b>{paypal.orderId}</b>
        </span>
        {paypal.invoiceId ? (
          <span>
            Balance invoice <b>{paypal.invoiceId}</b>
          </span>
        ) : null}
      </li>
    </ol>
  );
}

function HowItWorks() {
  const steps = [
    { icon: Search, title: "An agent asks", text: "A piece, who it is for, a ceiling, and a deadline." },
    { icon: Receipt, title: "Policy prices it", text: "40% deposit. The model never sets the amount." },
    { icon: ShieldCheck, title: "The mandate is checked", text: "Registered agent, signed consent. Card numbers are refused." },
    { icon: Lock, title: "PayPal holds the deposit", text: "Capture when it ships. Refund through PayPal if needed." },
  ];
  return (
    <div className="how">
      <h3>How a sale works</h3>
      <ol>
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <li key={step.title}>
              <span className="how-icon">
                <Icon size={16} />
              </span>
              <span>
                <b>{step.title}</b>
                <small>{step.text}</small>
              </span>
            </li>
          );
        })}
      </ol>
      <div className="agents">
        <p className="eyebrow">Registered agents</p>
        <ul>
          {["Juniper", "Northwind", "Atelier"].map((name) => (
            <li key={name}>
              <ShieldCheck size={14} /> {name}
            </li>
          ))}
          <li className="out">
            <ShieldX size={14} /> Anyone else
          </li>
        </ul>
      </div>
    </div>
  );
}

function groupTurns(entries: TranscriptEntry[]) {
  const turns: Turn[] = [];
  for (const entry of entries) {
    if (entry.role !== "trace") {
      turns.push({ kind: "line", entry });
      continue;
    }
    const last = turns.at(-1);
    if (last?.kind === "checks") last.items.push(entry);
    else turns.push({ kind: "checks", id: entry.id, items: [entry] });
  }
  return turns;
}

function LivePayPal({
  clientId,
  onDone,
  onError,
}: {
  clientId: string;
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const [Buttons, setButtons] = useState<React.ComponentType<{
    clientId: string;
    onDone: () => void;
    onError: (message: string) => void;
  }> | null>(null);
  useEffect(() => {
    import("./paypal-live").then((mod) => setButtons(() => mod.PayPalLive));
  }, []);
  if (!Buttons) return <p className="fine">Loading PayPal…</p>;
  return <Buttons clientId={clientId} onDone={onDone} onError={onError} />;
}
