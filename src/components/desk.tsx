"use client";

import {
  ArrowUpRight,
  Ban,
  CalendarClock,
  Check,
  CreditCard,
  LoaderCircle,
  Lock,
  Minus,
  Receipt,
  ShieldCheck,
  ShieldX,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { percent, usd } from "@/lib/format";
import type { ShopSnapshot, TranscriptEntry } from "@/lib/types";
import { BuyingAs, signAs, type Signer } from "./buying-as";
import { PieceMark } from "./piece-mark";
import { useShop } from "./use-shop";

const PHASES = [
  { id: "idle", label: "Ask" },
  { id: "quoted", label: "Quoted" },
  { id: "authorized", label: "Held" },
  { id: "captured", label: "Captured" },
  { id: "refunded", label: "Settled" },
] as const;

const SALES = [
  {
    tag: "Full sale",
    pieceId: "desk-walnut",
    title: "Walnut writing desk",
    buyer: "for Juniper",
    note: "Quote, PayPal hold, the floor moves, capture, refund",
    chip: "Full sale: walnut desk",
    signer: "juniper",
    message: "Walnut writing desk for Juniper, Austin, before Friday, ceiling $880",
  },
  {
    tag: "Second buyer",
    pieceId: "bench-elm",
    title: "Elm bench",
    buyer: "for Atelier",
    note: "Same rules, a different agent and piece",
    chip: "Second buyer: elm bench",
    signer: "atelier",
    message: "Quote the elm bench for Atelier, ceiling $750",
  },
  {
    tag: "Browse",
    pieceId: "stool-oak",
    title: "Anything in white oak?",
    buyer: "No buyer named",
    note: "Plain words in, pieces and prices out",
    chip: "Browse: white oak",
    signer: "",
    message: "What do you have in white oak?",
  },
] as const;

const GUARDS = [
  {
    title: "Unregistered agent",
    stop: "The mandate refuses Drift",
    chip: "Unregistered agent",
    signer: "drift",
    message: "Drift wants the walnut writing desk, ceiling $900",
    icon: ShieldX,
  },
  {
    title: "Over budget",
    stop: "Policy holds the $2,400 price",
    chip: "Over budget",
    signer: "northwind",
    message: "Northwind wants the walnut dining table, ceiling $2,000",
    icon: Receipt,
  },
  {
    title: "Card number",
    stop: "Masked and refused",
    chip: "Card number",
    signer: "",
    message: "Just charge 4111 1111 1111 1111 for the walnut desk",
    icon: CreditCard,
  },
] as const;

const BEAT: Record<(typeof PHASES)[number]["id"], string> = {
  idle: "No amount yet.",
  quoted: "PayPal has not held anything yet.",
  authorized: "PayPal is holding the deposit. Capture when the piece ships.",
  captured: "The deposit is captured. The balance is on the invoice.",
  refunded: "Settled. The refund went back through PayPal and the order stands.",
};

const STAMP: Partial<Record<(typeof PHASES)[number]["id"], string>> = {
  authorized: "Held",
  captured: "Captured",
  refunded: "Refunded",
};

const LIVE_BEAT = "Approve in PayPal. This holds the deposit and charges nothing yet.";
const WORKING = "Checking the catalog, the market, and the mandate…";
const FAILED = "The request did not go through. Try again.";

type Turn =
  | { kind: "line"; entry: TranscriptEntry }
  | { kind: "checks"; id: string; items: TranscriptEntry[] };

export function Desk() {
  const { shop, error, act, refresh } = useShop();
  const [shown, setShown] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [brief, setBrief] = useState(() =>
    typeof window === "undefined" ? "" : (new URLSearchParams(window.location.search).get("ask") ?? ""),
  );
  const [buyingAs, setBuyingAs] = useState<Signer>("");
  const [signError, setSignError] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [settled, setSettled] = useState<ShopSnapshot | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const nextAction = useRef<HTMLButtonElement>(null);
  const focusAfter = useRef<"input" | "next" | null>(null);
  const booted = useRef(false);

  const count = shown ?? shop?.transcript.length ?? 0;
  const revealing = Boolean(shop && count < shop.transcript.length);
  const busy = running || revealing;

  if (shop && !revealing && settled !== shop) setSettled(shop);

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
        if (current === null || current >= target) {
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
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    if (!log.current?.childElementCount) return;
    if (node.scrollHeight > node.clientHeight + 1) node.scrollTo({ top: node.scrollHeight, behavior });
    else if (focusAfter.current) composer.current?.scrollIntoView({ block: "nearest", behavior });
  }, [count, running]);

  useEffect(() => {
    if (busy || !focusAfter.current) return;
    const want = focusAfter.current;
    focusAfter.current = null;
    if (want === "input") {
      field.current?.focus();
      return;
    }
    const replies = log.current?.querySelectorAll<HTMLElement>(".entry.clerk");
    const target = nextAction.current ?? replies?.[replies.length - 1] ?? field.current;
    target?.focus({ preventScroll: true });
    if (target?.matches(":focus-visible")) target.scrollIntoView({ block: "nearest" });
  }, [busy, settled]);

  async function ask(message: string, signer: Signer = buyingAs, typed = false) {
    const trimmed = message.trim();
    if (!trimmed || running) return;
    setSignError(null);
    setPayError(null);
    setRunning(true);
    focusAfter.current = typed ? "input" : "next";
    if (!typed) log.current?.focus({ preventScroll: true });
    try {
      await act("/api/clerk/ask", { message: trimmed, mandate: await signAs(signer) });
      setBrief("");
    } catch (problem) {
      focusAfter.current = null;
      setSignError(problem instanceof Error ? problem.message : FAILED);
      field.current?.focus();
    } finally {
      setRunning(false);
    }
  }

  async function run(url: string) {
    if (busy) return;
    setPayError(null);
    setRunning(true);
    focusAfter.current = "next";
    try {
      await act(url);
    } catch (problem) {
      focusAfter.current = null;
      setPayError(problem instanceof Error ? problem.message : FAILED);
    } finally {
      setRunning(false);
    }
  }

  if (error) return <p className="page" role="alert">{error}</p>;
  if (!shop) return <p className="page loading">Opening the shop…</p>;

  const entries = shop.transcript.slice(0, count);
  const view = settled ?? shop;
  const fresh = entries.length <= 1 && view.phase === "idle" && !busy;
  const turns = groupTurns(entries.slice(fresh ? 1 : 0));
  const quote = view.quote;
  const current = PHASES.findIndex((item) => item.id === view.phase);
  const hint =
    view.phase === "quoted"
      ? "Ask about the shop. This deposit stays open."
      : view.phase === "authorized"
        ? "Say the van is loaded to capture."
        : view.phase === "captured"
          ? "Ask for the $80 scuff refund."
          : view.phase === "refunded"
            ? "The week is settled. Reset to start again."
            : "Choose who is buying, then ask for any piece.";
  const beat = view.phase === "quoted" && view.mode === "live" ? LIVE_BEAT : BEAT[view.phase];
  const lastChecks = turns.findLast((turn) => turn.kind === "checks");
  const phaseLine = running
    ? WORKING
    : busy
      ? ""
      : [view.phase === "idle" ? "" : beat, lastChecks ? checkSummary(lastChecks.items) : ""].filter(Boolean).join(" ");

  return (
    <div className="desk-screen">
      <header className="top desk-top">
        <div>
          <h1>Agent</h1>
          <p className="week">Field &amp; Grain, Austin · {shop.merchant.week}</p>
        </div>
        <ol className="stepper" aria-label="Sale progress">
          {PHASES.map((step, index) => {
            const state = index < current || view.phase === "refunded" ? "done" : index === current ? "now" : "";
            return (
              <li key={step.id} className={state} aria-current={state === "now" ? "step" : undefined}>
                <i>{state === "done" ? <Check size={14} strokeWidth={3} /> : index + 1}</i>
                {step.label}
                {state === "done" && <span className="sr-only"> completed</span>}
              </li>
            );
          })}
        </ol>
      </header>
      <p className="sr-only" role="status">
        {phaseLine}
      </p>
      <div className="desk">
        <div className="conversation">
          <section className="panel thread" aria-label="Conversation">
            <div className="transcript" ref={scroller}>
              {fresh && <Welcome shop={shop} disabled={busy} onAsk={ask} />}
              <div className="log" role="log" aria-live="polite" aria-relevant="additions" aria-label="Transcript" tabIndex={-1} ref={log}>
                {!fresh &&
                  turns.map((turn) =>
                    turn.kind === "checks" ? (
                      <Checks key={turn.id} items={turn.items} />
                    ) : (
                      <Line key={turn.entry.id} entry={turn.entry} />
                    ),
                  )}
                {running && (
                  <div className="typing" aria-hidden>
                    <span className="who">Marlow</span>
                    <span>
                      <LoaderCircle size={14} className="spin" /> {WORKING}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <div className="composer" ref={composer}>
              {!fresh && view.phase === "idle" && !busy && (
                <div className="quick">
                  {SALES.map((sale) => (
                    <button key={sale.chip} type="button" className="chip-btn" onClick={() => ask(sale.message, sale.signer)}>
                      {sale.chip}
                    </button>
                  ))}
                  {GUARDS.map((guard) => (
                    <button key={guard.chip} type="button" className="chip-btn probe" onClick={() => ask(guard.message, guard.signer)}>
                      {guard.chip}
                    </button>
                  ))}
                </div>
              )}
              <div className="composer-meta">
                <BuyingAs value={buyingAs} onChange={setBuyingAs} />
                <p className="fine" id="ask-hint">{hint}</p>
              </div>
              <p className="fine error live-note" role="alert">{signError}</p>
              <form
                className="ask"
                onSubmit={(event) => {
                  event.preventDefault();
                  void ask(brief, buyingAs, true);
                }}
              >
                <input
                  ref={field}
                  value={brief}
                  onChange={(event) => setBrief(event.target.value)}
                  aria-label="Ask the agent"
                  aria-describedby="ask-hint"
                  aria-busy={running}
                  readOnly={running}
                />
                <button className="primary" type="submit" aria-disabled={running || !brief.trim()}>
                  {running ? "Working" : "Send"}
                </button>
              </form>
            </div>
          </section>

          <aside className="panel offer" aria-label="PayPal">
            <div className="offer-top">
              <p className="ticket-name">Job ticket · PayPal</p>
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
                  {STAMP[view.phase] && (
                    <span key={view.phase} className="stamp" aria-hidden>
                      {STAMP[view.phase]}
                    </span>
                  )}
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
                    <p className="beat">{beat}</p>
                    <div className="paypal-box">
                      {view.mode === "rehearsal" && (
                        <button ref={nextAction} className="primary pay" type="button" aria-disabled={busy} onClick={() => run("/api/paypal/authorize")}>
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
                      <p className="fine">
                        {view.mode === "live" ? "Sign in with a sandbox buyer account. " : ""}
                        {quote.pieceId === "desk-walnut" ? "Approving releases Thursday's mill for this desk." : ""}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="beat">{beat}</p>
                    <PaymentSteps shop={view} />
                    {view.phase === "authorized" && (
                      <button ref={nextAction} className="primary pay" type="button" aria-disabled={busy} onClick={() => run("/api/paypal/capture")}>
                        <Check size={16} /> Capture {usd(quote.deposit)} · van loaded
                      </button>
                    )}
                    {view.phase === "captured" && (
                      <button ref={nextAction} className="secondary pay" type="button" aria-disabled={busy} onClick={() => run("/api/paypal/refund")}>
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

                <p className="fine error live-note" role="alert">{payError}</p>

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

function Welcome({
  shop,
  disabled,
  onAsk,
}: {
  shop: ShopSnapshot;
  disabled: boolean;
  onAsk: (message: string, signer: Signer) => void;
}) {
  return (
    <div className="welcome">
      <header className="welcome-head">
        <h2>Who is buying today?</h2>
        <p>
          Ask for any piece in plain words. Marlow prices it from shop policy, checks the buyer&apos;s mandate, and asks
          PayPal to hold the deposit.
        </p>
      </header>
      <section className="book-group" role="group" aria-labelledby="group-sales">
        <div className="book-head">
          <h3 id="group-sales">Run a sale</h3>
          <span aria-hidden>Buyer</span>
          <span className="notes" aria-hidden>What you will see</span>
          <span className="amount" aria-hidden>Price</span>
        </div>
        {SALES.map((sale) => {
          const piece = shop.pieces.find((item) => item.id === sale.pieceId);
          const browse = sale.tag === "Browse";
          return (
            <button key={sale.chip} type="button" className="start" disabled={disabled} onClick={() => onAsk(sale.message, sale.signer)}>
              <PieceMark id={sale.pieceId} />
              <span className="start-name">
                <b>{sale.title}</b>
                <span className="start-tag">{sale.tag}</span>
              </span>
              <span className="start-buyer">{sale.buyer}</span>
              <span className="start-note">{sale.note}</span>
              <span className="start-price">{browse ? "Search" : piece ? usd(piece.price) : ""}</span>
              <ArrowUpRight size={16} className="row-go" />
            </button>
          );
        })}
      </section>
      <section className="book-group" role="group" aria-labelledby="group-guards">
        <div className="book-head">
          <h3 id="group-guards">Try to get past it</h3>
          <span aria-hidden>What stops it</span>
        </div>
        {GUARDS.map((guard) => {
          const Icon = guard.icon;
          return (
            <button key={guard.chip} type="button" className="guard" disabled={disabled} onClick={() => onAsk(guard.message, guard.signer)}>
              <span className="guard-icon">
                <Icon size={18} />
              </span>
              <b>{guard.title}</b>
              <small>{guard.stop}</small>
              <ArrowUpRight size={16} className="row-go" />
            </button>
          );
        })}
      </section>
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
    <article className="entry clerk" tabIndex={-1}>
      <div className="who">
        Marlow
        {entry.via === "model" && <span className="via">AI</span>}
      </div>
      <p>{entry.text}</p>
    </article>
  );
}

function Checks({ items }: { items: TranscriptEntry[] }) {
  const refused = items.some((item) => item.ok === false);
  return (
    <details className={`checks ${refused ? "refused" : ""}`} aria-live="off">
      <summary>
        <span className="sr-only">{checkSummary(items)}</span>
        <span className="chips">
          {items.map((item) => (
            <span key={item.id} className={`chip ${item.ok === false ? "no" : item.sample ? "sample" : ""}`}>
              {item.ok === false ? <Ban size={12} /> : item.sample ? <Minus size={12} strokeWidth={3} /> : <Check size={12} strokeWidth={3} />}
              {item.tool ?? "Shop"}
              <span className="sr-only"> {checkState(item)}</span>
            </span>
          ))}
        </span>
        <span className="checks-more">Details</span>
      </summary>
      <div className="check-list">
        {items.map((item) => (
          <p className="check" key={item.id}>
            <span>
              {item.tool ?? "Shop"}
              <span className="sr-only"> {checkState(item)}</span>
            </span>
            {item.text}
          </p>
        ))}
      </div>
    </details>
  );
}

function checkState(item: TranscriptEntry) {
  return item.ok === false ? "refused" : item.sample ? "sample data" : "passed";
}

function checkSummary(items: TranscriptEntry[]) {
  const tally = (state: string) => items.filter((item) => checkState(item) === state).length;
  const noun = items.length === 1 ? "check" : "checks";
  const counts = [
    `${tally("passed")} passed`,
    tally("sample data") ? `${tally("sample data")} sample data` : "",
    tally("refused") ? `${tally("refused")} refused` : "",
  ];
  return `${items.length} ${noun}: ${counts.filter(Boolean).join(", ")}.`;
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
            <b>
              {step.label}
              {step.done && <span className="sr-only"> completed</span>}
            </b>
            <small>{step.id ?? "Pending"}</small>
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
        {paypal.webhook ? <span>{paypal.webhook.note}</span> : null}
      </li>
    </ol>
  );
}

function HowItWorks() {
  const steps = [
    { title: "An agent asks", text: "A piece, who it is for, a ceiling, and a deadline." },
    { title: "Policy prices it", text: "40% deposit. The model never sets the amount." },
    { title: "The mandate is checked", text: "Registered agent, signed consent. Card numbers are refused." },
    { title: "PayPal holds the deposit", text: "Capture when it ships. Refund through PayPal if needed." },
  ];
  return (
    <div className="how">
      <h2>How a sale works</h2>
      <ol>
        {steps.map((step, index) => (
          <li key={step.title}>
            <i>{index + 1}</i>
            <span>
              <b>{step.title}</b>
              <small>{step.text}</small>
            </span>
          </li>
        ))}
      </ol>
      <div className="agents">
        <h3>Registered agents</h3>
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
