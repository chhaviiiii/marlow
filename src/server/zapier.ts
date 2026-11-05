export type ZapierEvent = {
  event: string;
  merchant: string;
  agent: string;
  piece: string;
  amount: string;
  currency: "USD";
  paypalOrderId: string;
  shipDate: string;
};

export async function emitZapier(payload: ZapierEvent) {
  const url = process.env.ZAPIER_HOOK_URL;
  if (!url) {
    return {
      delivered: false,
      note: "No ZAPIER_HOOK_URL. The payload is ready for a Catch Hook.",
      payload,
    };
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return {
    delivered: res.ok,
    note: res.ok ? "Zapier accepted the hook." : `Zapier returned ${res.status}.`,
    payload,
  };
}
