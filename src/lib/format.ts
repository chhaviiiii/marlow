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
