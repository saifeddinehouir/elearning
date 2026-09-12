import { test } from "node:test";
import assert from "node:assert/strict";
import { applySM2, newReviewState, gradeForBinary, GRADE, MIN_EASE, stageOf } from "../src/sm2.js";
import { startOfDay, addDays } from "../src/format.js";

const fresh = () => newReviewState("q1", "d1", "Topic");

test("first correct review schedules one day out, EF unchanged for GOOD", () => {
  const now = Date.now();
  const s = applySM2(fresh(), GRADE.GOOD, now);
  assert.equal(s.repetitions, 1);
  assert.equal(s.interval, 1);
  assert.equal(s.totalReviews, 1);
  assert.equal(s.dueDate, addDays(startOfDay(now), 1).getTime());
  assert.ok(Math.abs(s.easeFactor - 2.5) < 1e-9);
});

test("EASY raises the ease factor", () => {
  const s = applySM2(fresh(), GRADE.EASY);
  assert.ok(Math.abs(s.easeFactor - 2.6) < 1e-9);
});

test("second correct review is six days", () => {
  let s = applySM2(fresh(), GRADE.GOOD);
  s = applySM2(s, GRADE.GOOD);
  assert.equal(s.repetitions, 2);
  assert.equal(s.interval, 6);
});

test("third correct review multiplies by ease", () => {
  let s = applySM2(fresh(), GRADE.GOOD);
  s = applySM2(s, GRADE.GOOD);
  const easeBefore = s.easeFactor;
  s = applySM2(s, GRADE.GOOD);
  assert.equal(s.interval, Math.round(6 * easeBefore));
  assert.equal(s.repetitions, 3);
});

test("incorrect answer resets repetitions and records a lapse", () => {
  let s = applySM2(fresh(), GRADE.GOOD);
  s = applySM2(s, GRADE.GOOD);
  s = applySM2(s, GRADE.AGAIN);
  assert.equal(s.repetitions, 0);
  assert.equal(s.interval, 1);
  assert.equal(s.lapses, 1);
  assert.equal(s.dueDate, addDays(startOfDay(Date.now()), 1).getTime());
});

test("ease factor never drops below the floor", () => {
  let s = fresh();
  for (let i = 0; i < 20; i++) s = applySM2(s, GRADE.AGAIN);
  assert.ok(Math.abs(s.easeFactor - MIN_EASE) < 1e-9);
});

test("binary grade mapping", () => {
  assert.equal(gradeForBinary(true), GRADE.GOOD);
  assert.equal(gradeForBinary(false), GRADE.AGAIN);
});

test("applySM2 does not mutate its input", () => {
  const s0 = fresh();
  const snapshot = JSON.stringify(s0);
  applySM2(s0, GRADE.GOOD);
  assert.equal(JSON.stringify(s0), snapshot);
});

test("stage transitions", () => {
  assert.equal(stageOf(null), "new");
  let s = applySM2(fresh(), GRADE.GOOD);
  assert.equal(stageOf(s), "learning");
  s = applySM2(s, GRADE.GOOD);
  s = applySM2(s, GRADE.GOOD);
  assert.equal(stageOf(s), "review");
  s = applySM2(s, GRADE.AGAIN);
  assert.equal(stageOf(s), "lapsed");
});
