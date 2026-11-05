"use client";

import { useEffect, useState } from "react";
import type { ShopSnapshot } from "@/lib/types";
import { postAction } from "./shell";

async function load() {
  const res = await fetch("/api/shop");
  if (!res.ok) throw new Error("Could not load the shop.");
  return (await res.json()) as ShopSnapshot;
}

export function useShop() {
  const [shop, setShop] = useState<ShopSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setShop(await load());
  }

  useEffect(() => {
    let alive = true;
    load()
      .then((data) => {
        if (alive) setShop(data);
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : "Load failed");
      });
    return () => {
      alive = false;
    };
  }, []);

  // A webhook changes the shop with no browser request, so watch an open live payment.
  const watching = shop?.mode === "live" && Boolean(shop.paypal);
  useEffect(() => {
    if (!watching) return;
    const timer = window.setInterval(() => {
      load()
        .then((data) => setShop((current) => (current && data.version > current.version ? data : current)))
        .catch(() => {});
    }, 5000);
    return () => window.clearInterval(timer);
  }, [watching]);

  async function act(url: string, body?: unknown) {
    const data = await postAction(url, body);
    setShop(data.shop);
    return data.added;
  }

  return { shop, error, act, refresh };
}
