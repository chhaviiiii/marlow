export function money(n: number) {
  return Math.round(n * 100) / 100;
}

export function usd(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(money(n));
}

export function moneyString(n: number) {
  return money(n).toFixed(2);
}

/** PayPal refuses a brand name or a purchase unit description over 127 characters. */
export function paypalText(text: string) {
  return text.slice(0, 127);
}

export function depositDescription(pieceName: string, merchantName?: string) {
  return paypalText(merchantName ? `${merchantName}: ${pieceName} deposit` : `${pieceName} deposit`);
}

export function percent(ratio: number) {
  return `${Math.round(ratio * 1000) / 10}%`;
}

export function austin(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}
