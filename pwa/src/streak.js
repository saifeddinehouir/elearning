// Streak math over StudyDay rows: { dayStart, answered, correct, completedGoal }.

import { startOfDay, addDays } from "./format.js";

const activeDayKeys = (studyDays) =>
  new Set(studyDays.filter((d) => d.answered > 0).map((d) => startOfDay(d.dayStart).getTime()));

// Consecutive days ending today (or yesterday, if today is not done yet).
export function currentStreak(studyDays, now = Date.now()) {
  const active = activeDayKeys(studyDays);
  if (active.size === 0) return 0;

  let cursor = startOfDay(now).getTime();
  if (!active.has(cursor)) cursor = addDays(cursor, -1).getTime();

  let streak = 0;
  while (active.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1).getTime();
  }
  return streak;
}

export function longestStreak(studyDays) {
  const days = [...activeDayKeys(studyDays)].sort((a, b) => a - b);
  if (days.length === 0) return 0;

  let best = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    if (addDays(days[i - 1], 1).getTime() === days[i]) run += 1;
    else run = 1;
    best = Math.max(best, run);
  }
  return best;
}

export const totalDaysStudied = (studyDays) => studyDays.filter((d) => d.answered > 0).length;
