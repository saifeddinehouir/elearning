// SM-2 spaced-repetition scheduler. Pure functions over a plain review-state
// object, mirrored 1:1 from the native version.
//
// review state shape:
//   { questionId, deckId, topic,
//     easeFactor, interval, repetitions, dueDate,
//     lastReviewedAt, totalReviews, lapses }

import { startOfDay, addDays } from "./format.js";

export const MIN_EASE = 1.3;

// SM-2 answer quality. MCQ answers are binary so only GOOD / AGAIN are used.
export const GRADE = { AGAIN: 0, HARD: 3, GOOD: 4, EASY: 5 };

export const gradeForBinary = (correct) => (correct ? GRADE.GOOD : GRADE.AGAIN);

export function newReviewState(questionId, deckId, topic, now = Date.now()) {
  return {
    questionId,
    deckId,
    topic: topic || "General",
    easeFactor: 2.5,
    interval: 0,
    repetitions: 0,
    dueDate: startOfDay(now).getTime(),
    lastReviewedAt: null,
    totalReviews: 0,
    lapses: 0,
  };
}

/**
 * Returns a NEW review-state object with SM-2 applied. Does not mutate input.
 *   - correct (q >= 3): interval 1 -> 6 -> round(interval * ease); repetitions++
 *   - incorrect (q < 3): repetitions -> 0, interval -> 1, lapses++
 *   - ease: EF += 0.1 - (5 - q)(0.08 + (5 - q)0.02), floored at 1.3
 */
export function applySM2(state, grade, now = Date.now()) {
  const q = grade;
  const s = { ...state };
  s.totalReviews += 1;

  if (q < 3) {
    s.repetitions = 0;
    s.interval = 1;
    s.lapses += 1;
  } else {
    if (s.repetitions === 0) s.interval = 1;
    else if (s.repetitions === 1) s.interval = 6;
    else s.interval = Math.round(s.interval * s.easeFactor);
    s.repetitions += 1;
  }

  const delta = 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02);
  s.easeFactor = Math.max(MIN_EASE, s.easeFactor + delta);

  s.lastReviewedAt = now;
  const interval = Math.max(1, s.interval);
  s.dueDate = addDays(startOfDay(now), interval).getTime();

  return s;
}

// Non-mutating preview of the next interval in days.
export function projectedInterval({ easeFactor, interval, repetitions }, grade) {
  if (grade < 3) return 1;
  if (repetitions === 0) return 1;
  if (repetitions === 1) return 6;
  return Math.round(interval * easeFactor);
}

export function stageOf(state) {
  if (!state || state.totalReviews === 0) return "new";
  if (state.lapses > 0 && state.repetitions === 0) return "lapsed";
  if (state.repetitions < 2) return "learning";
  return "review";
}
