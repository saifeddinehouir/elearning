// Free vs Pro: what each plan can install or use. Pure, no DOM.
//
// Gating only ever applies to *adding* content or *starting* a Pro feature.
// Anything already on the device stays usable whatever the plan, so turning
// enforcement on (or a subscription lapsing) never takes progress away.
//
// With ENFORCE on, Pro comes only from a plan the server confirmed (a Stripe
// purchase). The per-device preview override (see effectivePlan) is honored
// only on a development host, so it can't be used to unlock Pro.

import { PATTERN_PATH } from "./patterns.js";

export const ENFORCE = true;

// Hosts where the Free/Pro preview switch works.
export const DEV_HOSTS = new Set(["localhost", "127.0.0.1"]);
export const isDevHost = (hostname) => DEV_HOSTS.has(hostname);

export const PLANS = ["free", "pro"];

// Decks a free user gets from each built-in library, in study order.
export const FREE_LIBRARY_DECKS = 2;

// Built-in paths open to everyone. Every other path is Pro.
export const FREE_PATHS = new Set([PATTERN_PATH.key]);

// What Pro adds, in the order the upgrade sheet lists it: what exists today
// (`live`) first, then what's announced as coming.
export const PRO_FEATURES = [
  { id: "content", title: "Every built-in deck and path", sub: "The full Java & Spring and DevOps libraries, the Advanced patterns path, and every library added later.", live: true },
  { id: "ai-decks", title: "Make decks from YouTube videos", sub: "Paste a lecture or tutorial link and get a ready deck, with no JSON round trip.", live: true },
  { id: "interview-date", title: "Interview date mode", sub: "Set the date and reviews are paced so everything is covered by then, with a readiness score per topic.", live: true },
  { id: "company-prep", title: "Company-specific interview prep", sub: "Pick the company you're interviewing with and get a track built around how it interviews: the topics it favours, its question formats and its stages.", live: false },
  { id: "sync", title: "Cloud sync and backup", sub: "Progress follows you between phone and laptop, and survives a lost or reset phone.", live: false },
];

export const isPlan = (p) => PLANS.includes(p);

// The plan in force: a valid override wins, then a paid plan confirmed by the
// server, otherwise Pro until ENFORCE.
export function effectivePlan(override, enforce = ENFORCE, entitled = false) {
  if (isPlan(override)) return override;
  if (entitled) return "pro";
  return enforce ? "free" : "pro";
}

// Whether a cached /api/me answer still grants Pro: a subscription until the
// next check says otherwise, a pass until its end date.
export function entitledFrom(cache, now = Date.now()) {
  if (!cache || cache.plan !== "pro") return false;
  return cache.subscription === true || (Number.isFinite(cache.proUntil) && cache.proUntil > now);
}

export const isPro = (plan) => plan === "pro";

export const canInstallPath = (plan, pathKey) => isPro(plan) || FREE_PATHS.has(pathKey);

// The library index entries a plan may install, keeping their order.
export const libraryEntriesFor = (plan, index) => (isPro(plan) ? index : index.slice(0, FREE_LIBRARY_DECKS));

export const hasFeature = (plan, featureId) => isPro(plan) && PRO_FEATURES.some((f) => f.id === featureId && f.live);
