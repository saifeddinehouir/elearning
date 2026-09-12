// Aggregations over Attempt rows:
//   { id, questionId, date, wasCorrect, chosenIndex, topic, difficulty, deckName }

import { startOfDay, addDays } from "./format.js";

export function overall(attempts) {
  const correct = attempts.filter((a) => a.wasCorrect).length;
  return {
    answered: attempts.length,
    correct,
    rate: attempts.length ? correct / attempts.length : 0,
  };
}

function buckets(attempts, keyFn) {
  const map = {};
  for (const a of attempts) {
    const k = keyFn(a);
    const e = map[k] || (map[k] = { label: k, correct: 0, total: 0 });
    e.total += 1;
    if (a.wasCorrect) e.correct += 1;
  }
  return Object.values(map).map((e) => ({ ...e, rate: e.total ? e.correct / e.total : 0 }));
}

export const byTopic = (attempts, ascending = true) =>
  buckets(attempts, (a) => a.topic || "General").sort((x, y) =>
    ascending ? x.rate - y.rate : y.rate - x.rate
  );

export const byDeck = (attempts) =>
  buckets(attempts, (a) => a.deckName || "Unknown").sort((x, y) => x.label.localeCompare(y.label));

export function byDifficulty(attempts) {
  const order = ["easy", "medium", "hard"];
  return order
    .map((d) => {
      const subset = attempts.filter((a) => a.difficulty === d);
      if (!subset.length) return null;
      const correct = subset.filter((a) => a.wasCorrect).length;
      return { label: d, correct, total: subset.length, rate: correct / subset.length };
    })
    .filter(Boolean);
}

// Continuous per-day series for the last `days` days (zero-filled).
export function daily(attempts, days, now = Date.now()) {
  const start = addDays(startOfDay(now), -(days - 1)).getTime();
  const map = {};
  for (const a of attempts) {
    const d = startOfDay(a.date).getTime();
    if (d < start) continue;
    const e = map[d] || (map[d] = { correct: 0, total: 0 });
    e.total += 1;
    if (a.wasCorrect) e.correct += 1;
  }
  const out = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(start, i).getTime();
    const e = map[d] || { correct: 0, total: 0 };
    out.push({ day: d, answered: e.total, correct: e.correct, rate: e.total ? e.correct / e.total : 0 });
  }
  return out;
}
