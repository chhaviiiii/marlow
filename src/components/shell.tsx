"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { ActionResult, ShopSnapshot } from "@/lib/types";

const LINKS = [
  ["/", "Agent"],
  ["/floor", "Floor"],
  ["/books", "Books"],
  ["/catalog", "Catalog"],
  ["/permissions", "Rules"],
  ["/setup", "Set up"],
];

type Status = Pick<ShopSnapshot, "mode" | "llm" | "model">;

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const merchantSide = path === "/setup" || path.startsWith("/m/");
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    fetch("/api/shop")
      .then((res) => res.json())
      .then((shop: ShopSnapshot) => setStatus({ mode: shop.mode, llm: shop.llm, model: shop.model }))
      .catch(() => setStatus({ mode: "rehearsal", llm: false, model: "" }));
  }, [path]);

  async function reset() {
    await fetch("/api/shop", { method: "POST" });
    window.location.assign("/");
  }

  return (
    <div className="app">
      <header className="rail">
        <Link href="/" className="mark">
          <div className="seal">M</div>
          <div>
            <strong>Marlow</strong>
            <span>{merchantSide ? "Shops for AI agents" : "Field & Grain"}</span>
          </div>
        </Link>
        <nav className="nav">
          {LINKS.map(([href, label]) => (
            <Link key={href} href={href} className={path === href ? "active" : ""}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="rail-foot">
          {status && (
            <>
              <div className={`pill ${status.llm ? "live" : ""}`} title="Which brain picks the tools">
                <i />
                {status.llm ? `AI · ${status.model}` : "AI · rules only"}
              </div>
              <div className={`pill ${status.mode === "live" ? "live" : ""}`}>
                <i />
                {status.mode === "live" ? "PayPal sandbox" : "PayPal rehearsal"}
              </div>
            </>
          )}
          {!merchantSide && (
            <button className="ghost" type="button" onClick={reset}>
              Reset the week
            </button>
          )}
        </div>
      </header>
      <div className="stage">{children}</div>
    </div>
  );
}

export async function postAction(url: string, body?: unknown): Promise<ActionResult> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = (await res.json()) as ActionResult;
  if (!data.shop) throw new Error("The shop did not answer.");
  return data;
}
