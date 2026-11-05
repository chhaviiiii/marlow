export async function confirmListing(url: string | undefined, label: string) {
  const key = process.env.KERNEL_API_KEY;
  if (!key || !url) {
    return {
      live: false,
      note: url
        ? `Kernel rehearsal. Would open “${label}” and read the price before the quote leaves the shop.`
        : `Kernel rehearsal. No public listing URL on the top comp, so the clerk cites the price without a browser.`,
      sessionId: null as string | null,
      liveViewUrl: null as string | null,
    };
  }
  const res = await fetch("https://api.onkernel.com/browsers", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      headless: true,
      timeout_seconds: 90,
      start_url: url,
    }),
  });
  if (!res.ok) {
    return {
      live: false,
      note: `Kernel returned ${res.status}. The quote stands on the comp data.`,
      sessionId: null,
      liveViewUrl: null,
    };
  }
  const json = (await res.json()) as {
    session_id?: string;
    browser_live_view_url?: string;
  };
  return {
    live: true,
    note: `Kernel browser ${json.session_id ?? ""} opened the comp.`,
    sessionId: json.session_id ?? null,
    liveViewUrl: json.browser_live_view_url ?? null,
  };
}
