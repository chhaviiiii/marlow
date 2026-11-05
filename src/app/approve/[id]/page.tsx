"use client";

import { Lock, ShieldCheck } from "lucide-react";
import dynamic from "next/dynamic";
import { use, useCallback, useEffect, useState } from "react";
import { usd } from "@/lib/format";

const PayPalLive = dynamic(() => import("@/components/paypal-live").then((mod) => mod.PayPalLive), { ssr: false });

type Order = {
  status: string;
  buyer?: string;
  piece?: string;
  city?: string;
  ceiling?: number;
  price?: number;
  deposit?: number;
  balance_on_delivery?: number;
  mandate_id?: string;
  paypal_mode: "sandbox" | "rehearsal";
  paypal_order_id?: string;
  paypal_authorization_id?: string;
  paypalClientId: string | null;
};

export default function ApprovePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [order, setOrder] = useState<Order | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const read = useCallback(async () => {
    const res = await fetch(`/api/orders/${id}`);
    if (!res.ok) throw new Error("This approval link is not valid.");
    return (await res.json()) as Order;
  }, [id]);

  const load = () => read().then(setOrder);

  useEffect(() => {
    read().then(setOrder, (error: Error) => setProblem(error.message));
  }, [read]);

  async function hold() {
    setWorking(true);
    try {
      const res = await fetch(`/api/orders/${id}/paypal/authorize`, { method: "POST" });
      if (!res.ok) throw new Error(`Authorize returned ${res.status}`);
      await load();
    } catch {
      setProblem("The hold did not go through. Try again.");
    } finally {
      setWorking(false);
    }
  }

  if (!order) return <p className="page" role={problem ? "alert" : undefined}>{problem ?? "Opening the order…"}</p>;

  return (
    <div className="page">
      <header className="top" style={{ paddingLeft: 0, paddingRight: 0 }}>
        <div>
          <p className="kicker">Field &amp; Grain · Approval</p>
          <h1>{usd(order.deposit ?? 0)} deposit</h1>
          <p className="lede">
            {order.buyer} asked for {order.piece}. Only you can approve this. Your agent cannot.
          </p>
        </div>
      </header>
      <section className="card">
        <div className="mandate">
          <ShieldCheck size={18} />
          <div>
            <b>{order.buyer} · registered agent</b>
            <span>
              Mandate {order.mandate_id} · ceiling {usd(order.ceiling ?? 0)} · {order.city}
            </span>
          </div>
        </div>
        <dl className="meta">
          <div>
            <dt>Total</dt>
            <dd>{usd(order.price ?? 0)}</dd>
          </div>
          <div>
            <dt>On delivery</dt>
            <dd>{usd(order.balance_on_delivery ?? 0)}</dd>
          </div>
        </dl>
        {order.status === "awaiting_buyer_approval" ? (
          <div className="paypal-box">
            {order.paypal_mode === "rehearsal" && (
              <>
                <button className="primary pay" type="button" disabled={working} onClick={hold}>
                  <Lock size={16} /> Hold {usd(order.deposit ?? 0)} with PayPal
                </button>
                <p className="fine">Rehearsal. This server has no PayPal keys, so no money moves.</p>
              </>
            )}
            {order.paypal_mode === "sandbox" && order.paypalClientId && (
              <PayPalLive
                clientId={order.paypalClientId}
                base={`/api/orders/${id}/paypal`}
                onDone={() => {
                  setProblem(null);
                  load().catch(() => setProblem("The order did not refresh."));
                }}
                onError={setProblem}
              />
            )}
            <p className="fine error live-note" role="alert">{problem}</p>
          </div>
        ) : (
          <p className="beat">
            PayPal is holding the deposit. Authorization {order.paypal_authorization_id}. You can close this page.
          </p>
        )}
      </section>
    </div>
  );
}
