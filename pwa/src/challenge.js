// Daily challenge: a different themed mini-set each weekday, picked
// deterministically from the day so it's the same challenge all day long.
// Pure logic over the same question shape composeSession() uses:
//   { id, topic, difficulty, kind, reviewState?, attempts? }

import { rngFor, seededShuffle } from "./random.js";
import { topicSuccessRates } from "./session.js";
import { startOfDay } from "./format.js";
import { currentStreak, longestStreak } from "./streak.js";

// Indexed by Date#getDay(): 0 = Sunday.
export const CHALLENGES = [
  { id: "gauntlet", name: "Review Gauntlet", emoji: "🛡️", color: "red", size: 6, blurb: "The questions you've missed most, back for a rematch." },
  { id: "pattern-sprint", name: "Pattern Sprint", emoji: "🧩", color: "purple", size: 6, kinds: ["approach"], blurb: "Read the problem, name the pattern. Six in a row." },
  { id: "big-o", name: "Big-O Blitz", emoji: "⏱️", color: "teal", size: 6, kinds: ["complexity"], blurb: "Time and space complexity, no hand-waving." },
  { id: "weak-spot", name: "Weak Spot", emoji: "🎯", color: "orange", size: 6, blurb: "Everything from the topic you miss most." },
  { id: "trace", name: "Trace & Fill", emoji: "🔍", color: "accent", size: 6, kinds: ["trace", "fill_blank"], blurb: "Step through the code and fill in the missing piece." },
  { id: "speed", name: "Speed Round", emoji: "⚡", color: "orange", size: 8, timeLimitSec: 20, blurb: "8 questions, 20 seconds each. Trust your gut." },
  { id: "hard-mode", name: "Hard Mode", emoji: "🏔️", color: "purple", size: 6, difficulties: ["hard", "medium"], blurb: "Only medium and hard problems. No easy outs." },
];

export const challengeForDay = (now = Date.now()) => CHALLENGES[new Date(now).getDay()];

const isSeen = (q) => q.reviewState && q.reviewState.totalReviews > 0;
const wrongRate = (q) => {
  const n = (q.attempts || []).length;
  return n ? q.attempts.filter((a) => !a.wasCorrect).length / n : 0;
};

// Candidates that match the challenge's theme, best-first where order matters.
function themed(pool, def) {
  switch (def.id) {
    case "gauntlet":
      return pool
        .filter((q) => isSeen(q) && (q.reviewState.lapses > 0 || wrongRate(q) > 0))
        .sort((a, b) => b.reviewState.lapses - a.reviewState.lapses || wrongRate(b) - wrongRate(a));
    case "weak-spot": {
      const rates = topicSuccessRates(pool);
      const tried = Object.entries(rates).sort((a, b) => a[1] - b[1]);
      if (tried.length === 0) return [];
      // The weakest topic first, then the next weakest, so small topics still fill the set.
      const rank = new Map(tried.map(([t], i) => [t, i]));
      return pool
        .filter((q) => rank.has(q.topic || "General"))
        .sort((a, b) => rank.get(a.topic || "General") - rank.get(b.topic || "General"));
    }
    default:
      return pool.filter(
        (q) => (!def.kinds || def.kinds.includes(q.kind)) && (!def.difficulties || def.difficulties.includes(q.difficulty))
      );
  }
}

/**
 * Picks the day's questions. Same pool + same day → same result.
 * Returns { def, questions, themed: boolean, focus?: string }. `themed` is false
 * when there weren't enough matching questions and the set was topped up with
 * a general mix (the UI says so instead of pretending).
 */
export function pickChallenge(pool, def, now = Date.now()) {
  const day = startOfDay(now).getTime();
  const rng = rngFor(`${def.id}:${day}`);
  const size = Math.min(def.size, pool.length);

  const candidates = themed(pool, def);
  let primary;
  if (def.id === "weak-spot") {
    // Shuffle within each topic but keep topics weakest-first, so the set
    // only spills into the next topic once the weakest one runs out.
    const groups = new Map();
    for (const q of candidates) {
      const t = q.topic || "General";
      if (!groups.has(t)) groups.set(t, []);
      groups.get(t).push(q);
    }
    primary = [...groups.values()].flatMap((g) => seededShuffle(g, rng));
  } else if (def.id === "gauntlet") {
    // Worst-first, shuffled within a window of 3× the set size for variety.
    primary = seededShuffle(candidates.slice(0, size * 3), rng);
  } else {
    primary = seededShuffle(candidates, rng);
  }

  const chosen = primary.slice(0, size);
  const ids = new Set(chosen.map((q) => q.id));
  if (chosen.length < size) {
    for (const q of seededShuffle(pool, rng)) {
      if (chosen.length >= size) break;
      if (!ids.has(q.id)) {
        chosen.push(q);
        ids.add(q.id);
      }
    }
  }

  const themedEnough = primary.length >= Math.ceil(size / 2);
  const focus = def.id === "weak-spot" && candidates.length ? candidates[0].topic || "General" : undefined;
  return { def, questions: chosen, themed: themedEnough, focus };
}

// Challenge records: { dayStart, challengeId, score, total, bestScore, completedAt }.
const asDays = (records) => records.filter((r) => r.completedAt).map((r) => ({ dayStart: r.dayStart, answered: 1 }));
export const challengeStreak = (records, now = Date.now()) => currentStreak(asDays(records), now);
export const longestChallengeStreak = (records) => longestStreak(asDays(records));

// The 7 days (Mon → Sun) of the week containing `now`, for the week strip.
export function weekDays(now = Date.now()) {
  const today = startOfDay(now);
  const mondayOffset = (today.getDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - mondayOffset + i);
    return d.getTime();
  });
}

// Milliseconds until the next local midnight (when a new challenge appears).
export function msUntilTomorrow(now = Date.now()) {
  const next = startOfDay(now);
  next.setDate(next.getDate() + 1);
  return next.getTime() - now;
}
