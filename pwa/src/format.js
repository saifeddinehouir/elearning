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
