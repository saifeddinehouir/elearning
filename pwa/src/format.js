// Small pure helpers shared across logic and UI. No DOM, no storage.

export function startOfDay(input = Date.now()) {
  const d = new Date(input);
  d.setHours(0, 0, 0, 0);
  return d;
}

export const startOfDayMs = (input = Date.now()) => startOfDay(input).getTime();

export function addDays(input, n) {
  const d = new Date(input);
  d.setDate(d.getDate() + n);
  return d;
}

export const dayKey = (input) => startOfDay(input).getTime();

export const pct = (x) => `${Math.round((x || 0) * 100)}%`;

export function uuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function fmtDate(ms) {
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function fmtDateFull(ms) {
  return new Date(ms).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// A Stripe amount (minor units) as a price, e.g. 499 "usd" "month" → "$4.99 / month".
export function fmtPrice(amount, currency, interval = null, locale = undefined) {
  if (!Number.isFinite(amount) || !currency) return "";
  const nf = new Intl.NumberFormat(locale, { style: "currency", currency: currency.toUpperCase() });
  const digits = nf.resolvedOptions().maximumFractionDigits;
  const text = nf.format(amount / 10 ** digits);
  return interval ? `${text} / ${interval}` : text;
}

// "Saif Eddine Houir" → "Saif". Empty when there's no usable name.
export function firstName(name) {
  const first = String(name || "").trim().split(/\s+/)[0] || "";
  return first.length > 24 ? first.slice(0, 24) : first;
}

// The Today title: time-of-day greeting, with the first name when known.
export function greetingFor(hour, name = "") {
  const g = hour < 5 ? "Late night" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const first = firstName(name);
  return first ? `${g}, ${first}` : g;
}
