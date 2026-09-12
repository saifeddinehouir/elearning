import { test } from "node:test";
import assert from "node:assert/strict";
import { currentStreak, longestStreak, totalDaysStudied } from "../src/streak.js";
import { addDays, startOfDay } from "../src/format.js";

const dayAgo = (n) => ({ dayStart: addDays(startOfDay(Date.now()), -n).getTime(), answered: 5, correct: 4 });

test("counts consecutive days ending today", () => {
  const days = [0, 1, 2, 4].map(dayAgo);
  assert.equal(currentStreak(days), 3);
  assert.equal(longestStreak(days), 3);
});

test("allows today to be not yet studied", () => {
  const days = [1, 2, 3].map(dayAgo);
  assert.equal(currentStreak(days), 3);
});

test("breaks the streak on a gap", () => {
  const days = [0, 1, 3, 4, 5].map(dayAgo);
  assert.equal(currentStreak(days), 2);
  assert.equal(longestStreak(days), 3);
});

test("ignores days with no answers", () => {
  const days = [dayAgo(0), { dayStart: addDays(startOfDay(Date.now()), -1).getTime(), answered: 0, correct: 0 }, dayAgo(2)];
  assert.equal(currentStreak(days), 1);
  assert.equal(totalDaysStudied(days), 2);
});

test("empty history", () => {
  assert.equal(currentStreak([]), 0);
  assert.equal(longestStreak([]), 0);
});
