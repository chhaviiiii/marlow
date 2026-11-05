"use client";

import { FUNDING, PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import type { ShopSnapshot } from "@/lib/types";

type OrderResponse = {
  orderId?: string;
  shop?: ShopSnapshot;
};

function lastLine(shop?: ShopSnapshot) {
  return shop?.transcript.at(-1)?.text;
}

export function PayPalLive({
  clientId,
  onDone,
  onError,
}: {
  clientId: string;
  onDone: () => void;
  onError: (message: string) => void;
}) {
  return (
    <PayPalScriptProvider options={{ clientId, currency: "USD", intent: "authorize" }}>
      <PayPalButtons
        fundingSource={FUNDING.PAYPAL}
        style={{ layout: "vertical", shape: "pill", label: "paypal", color: "blue", height: 46 }}
        createOrder={async () => {
          const res = await fetch("/api/paypal/orders", { method: "POST" });
          const data = (await res.json()) as OrderResponse;
          if (!data.orderId) throw new Error(lastLine(data.shop) || "PayPal did not open an order.");
          onDone();
          return data.orderId;
        }}
        onApprove={async (data) => {
          const res = await fetch("/api/paypal/authorize", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ orderId: data.orderID }),
          });
          const body = (await res.json()) as OrderResponse;
          onDone();
          if (body.shop?.phase !== "authorized") {
            onError(lastLine(body.shop) || "PayPal did not hold the deposit.");
          }
        }}
        onError={(error) => {
          onError(error instanceof Error ? error.message : "PayPal could not open. Try the button again.");
        }}
      />
    </PayPalScriptProvider>
  );
}
