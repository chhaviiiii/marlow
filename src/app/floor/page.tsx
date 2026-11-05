"use client";

import { ArrowUpRight, CalendarClock, CircleCheck } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useShop } from "@/components/use-shop";

const FloorScheduler = dynamic(() => import("@/components/floor-scheduler"), { ssr: false });

export default function FloorPage() {
  const { shop, error } = useShop();
  if (error) return <p className="page">{error}</p>;
  if (!shop) return <p className="page loading">Opening the floor…</p>;
  const desk = shop.events.find((event) => event.id === "desk-mill");
  return (
    <div className="page floor-page">
      <header className="top">
        <div>
          <h1>Money moves the week</h1>
          <p className="lede">The mill only keeps time that PayPal is backing. An unpaid hold gives way to a paid deposit.</p>
        </div>
        <p className="credit">Workshop schedule in Bryntum Scheduler</p>
      </header>
      {desk ? (
        <div className="floor-callout paid">
          <CircleCheck size={20} />
          <span>
            <b>Thursday&apos;s mill belongs to the walnut writing desk.</b> PayPal order {desk.orderId} is holding the
            deposit, so the unpaid stool was released and the desk took the mill, the finish bench, and Friday&apos;s van.
          </span>
        </div>
      ) : (
        <Link href="/" className="floor-callout">
          <CalendarClock size={20} />
          <span>
            <b>Thursday&apos;s mill is held for an unpaid stool.</b> Quote the walnut desk for Juniper and approve the
            deposit in PayPal. This week rewrites itself.
          </span>
          <ArrowUpRight size={18} />
        </Link>
      )}
      <section className="panel floor-wrap">
        <div className="floor-caption">
          <strong>{shop.merchant.name} · Mon Oct 5 to Fri Oct 9</strong>
          <div className="legend">
            <span><i className="sw-held" /> Unpaid hold</span>
            <span><i className="sw-block" /> Blocked</span>
            <span><i className="sw-auth" /> PayPal authorized</span>
            <span><i className="sw-commit" /> Committed</span>
            <span><i className="sw-release" /> Released</span>
          </div>
        </div>
        <FloorScheduler events={shop.events} tall />
      </section>
    </div>
  );
}
