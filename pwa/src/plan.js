// Free vs Pro: what each plan can install or use. Pure, no DOM.
//
// Gating only ever applies to *adding* content or *starting* a Pro feature.
// Anything already on the device stays usable whatever the plan, so turning
// enforcement on (or a subscription lapsing) never takes progress away.
//
// Nothing is enforced until ENFORCE is true: until billing is live everyone
// gets Pro. A per-device override (see effectivePlan) previews either side.

import { PATTERN_PATH } from "./patterns.js";

export const ENFORCE = false;

export const PLANS = ["free", "pro"];

// Decks a free user gets from each built-in library, in study order.
export const FREE_LIBRARY_DECKS = 2;

// Built-in paths open to everyone. Every other path is Pro.
export const FREE_PATHS = new Set([PATTERN_PATH.key]);

// What Pro adds, in the order the upgrade sheet lists it. `live` marks the
// ones that exist today; the rest are announced as coming.
export const PRO_FEATURES = [
  { id: "content", title: "Every built-in deck and path", sub: "The full Java & Spring and DevOps libraries, the Advanced patterns path, and every library added later.", live: true },
  { id: "ai-decks", title: "Make decks from your notes", sub: "Upload a PDF or paste notes and get a ready deck, without the copy-paste round trip.", live: false },
  { id: "sync", title: "Cloud sync and backup", sub: "Progress follows you between phone and laptop, and survives a lost or reset phone.", live: false },
  { id: "interview-date", title: "Interview date mode", sub: "Set the date and reviews are paced so everything is covered by then, with a readiness score per topic.", live: false },
];

export const isPlan = (p) => PLANS.includes(p);

// The plan in force: a valid override wins, otherwise Pro until ENFORCE.
export function effectivePlan(override, enforce = ENFORCE) {
  if (isPlan(override)) return override;
  return enforce ? "free" : "pro";
}

export const isPro = (plan) => plan === "pro";

export const canInstallPath = (plan, pathKey) => isPro(plan) || FREE_PATHS.has(pathKey);

// The library index entries a plan may install, keeping their order.
export const libraryEntriesFor = (plan, index) => (isPro(plan) ? index : index.slice(0, FREE_LIBRARY_DECKS));

export const hasFeature = (plan, featureId) => isPro(plan) && PRO_FEATURES.some((f) => f.id === featureId && f.live);
