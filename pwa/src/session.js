// Daily-queue builder. Pure logic over an array of "question" objects shaped as:
//   { id, topic, difficulty, reviewState?, attempts?: [{ wasCorrect }] }
// Mirrors the native SessionBuilder.

import { startOfDay, addDays } from "./format.js";

export const DEFAULT_CONFIG = { size: 15, newLimitRatio: 0.6 };

export function topicSuccessRates(questions) {
  const agg = {};
  for (const q of questions) {
    const t = q.topic || "General";
    for (const a of q.attempts || []) {
      const e = agg[t] || (agg[t] = { c: 0, n: 0 });
      e.n += 1;
      if (a.wasCorrect) e.c += 1;
    }
  }
  const out = {};
  for (const [t, e] of Object.entries(agg)) out[t] = e.n ? e.c / e.n : 0.5;
  return out;
}

// Efraimidis–Spirakis weighted sampling: key = U^(1/w), sort descending.
function weightedShuffle(items, weightFn) {
  return items
    .map((it) => [it, Math.pow(Math.random() || 1e-9, 1 / Math.max(1e-4, weightFn(it)))])
    .sort((a, b) => b[1] - a[1])
    .map((x) => x[0]);
}

const isNew = (q) => !q.reviewState || (q.reviewState.totalReviews || 0) === 0;
const isSeen = (q) => q.reviewState && q.reviewState.totalReviews > 0;

export function composeSession(questions, config = DEFAULT_CONFIG, now = Date.now()) {
  const size = config.size ?? DEFAULT_CONFIG.size;
  const newLimitRatio = config.newLimitRatio ?? DEFAULT_CONFIG.newLimitRatio;

  if (size <= 0 || questions.length === 0) {
    return { queue: [], due: 0, new: 0, ahead: 0, total: 0 };
  }

  const endOfToday = addDays(startOfDay(now), 1).getTime();
  const rates = topicSuccessRates(questions);
  const weight = (q) => 0.5 + (1 - (rates[q.topic || "General"] ?? 0.5));

  const dueReviews = questions
    .filter((q) => isSeen(q) && q.reviewState.dueDate < endOfToday)
    .sort((a, b) => a.reviewState.dueDate - b.reviewState.dueDate);
  const newQs = questions.filter(isNew);

  const chosen = [];
  const ids = new Set();
  const take = (arr, limit) => {
    let taken = 0;
    for (const q of arr) {
      if (taken >= limit) break;
      if (ids.has(q.id)) continue;
      chosen.push(q);
      ids.add(q.id);
      taken += 1;
    }
    return taken;
  };

  let due = 0;
  let fresh = 0;
  let ahead = 0;

  // 1. Due reviews first.
  due += take(dueReviews, size);

  // 2. New questions, soft-capped so reviews are not crowded out.
  if (chosen.length < size) {
    const cap = Math.max(newQs.length ? 1 : 0, Math.round(size * newLimitRatio));
    fresh += take(weightedShuffle(newQs, weight), Math.min(size - chosen.length, cap));
  }

  // 3. Pull-ahead: soonest-due future reviews.
  if (chosen.length < size) {
    const future = questions
      .filter((q) => isSeen(q) && q.reviewState.dueDate >= endOfToday)
      .sort((a, b) => a.reviewState.dueDate - b.reviewState.dueDate);
    ahead += take(future, size - chosen.length);
  }

  // 4. Any remaining new questions to reach the goal.
  if (chosen.length < size) {
    fresh += take(newQs, size - chosen.length);
  }

  return {
    queue: weightedShuffle(chosen, weight),
    due,
    new: fresh,
    ahead,
    total: chosen.length,
  };
}
