"use client";

import { useState } from "react";
import { useShop } from "@/components/use-shop";

const RULES = [
  ["Agent", "Must be registered. Unknown sessions are refused before any price leaves the shop."],
  ["Consent", "The mandate is signed to this city, ceiling, and delivery date. Any change breaks the signature."],
  ["Card numbers", "Refused and masked. The credential is a token bound to the mandate."],
  ["Deposit", "40%, authorized on PayPal before the mill is promised."],
  ["Capture", "Only when the van is loaded."],
  ["Margin", "Refuse anything under 8%."],
  ["Ceiling", "Never quote above the buyer's number."],
  ["Refund", "Only against a captured PayPal payment."],
  ["Price", "Set by the policy function. The model repeats it."],
] as const;

const LIVE = new Set(["enforced", "sandbox", "loaded", "live", "configured", "hooked", "token", "floor", "books"]);

export default function PermissionsPage() {
  const { shop, error } = useShop();
  const [deployNote, setDeployNote] = useState<string | null>(null);

  async function deploy() {
    const res = await fetch("/api/stack/deploy", { method: "POST" });
    const data = (await res.json()) as { note: string };
    setDeployNote(data.note);
  }

  if (error) return <p className="page">{error}</p>;
  if (!shop) return <p className="page loading">Opening the rules…</p>;

  return (
    <div className="page">
      <header className="top" style={{ paddingLeft: 0, paddingRight: 0 }}>
        <div>
          <p className="kicker">What the agent may do</p>
          <h1>Rules and wiring</h1>
          <p className="lede">
            Anyone can ask. Only a registered agent with signed consent can move PayPal. Card numbers are refused.
          </p>
        </div>
        <button className="secondary" type="button" onClick={deploy}>Check the Astropods deploy</button>
      </header>
      {deployNote && <p className="fine">{deployNote}</p>}
      <div className="rules">
        <section className="card">
          <p className="eyebrow">Shop policy</p>
          <ul className="rule-list">
            {RULES.map(([name, text]) => (
              <li key={name}>
                <b>{name}</b>
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="card">
          <p className="eyebrow">Live wiring</p>
          <div className="stack">
            {shop.integrations.map((item) => (
              <div key={item.name}>
                <strong>{item.name}</strong>
                <span>
                  <em className={`state ${LIVE.has(item.state) || item.state.startsWith("gpt") ? "on" : ""}`}>
                    {item.state}
                  </em>
                </span>
                <span>{item.detail}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
