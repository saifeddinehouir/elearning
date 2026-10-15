import { test } from "node:test";
import assert from "node:assert/strict";
import { daysLeft, isActive, reserveDays, effectiveDue, withInterviewDue, planToday, readiness, MAX_SESSION } from "../src/interview.js";
import { composeSession } from "../src/session.js";
import { addDays, startOfDay } from "../src/format.js";

// Fixed "now": noon on a Wednesday, away from DST changes.
const NOW = new Date(2026, 2, 11, 12, 0, 0).getTime();
const day = (n) => addDays(startOfDay(NOW), n).getTime();

let seq = 0;
const unseen = (topic = "Arrays") => ({ id: `q${seq++}`, topic, attempts: [] });
const seen = ({ topic = "Arrays", due = 1, last = -1, reps = 2, firstAttempt = last } = {}) => ({
  id: `q${seq++}`,
  topic,
  attempts: [{ date: day(firstAttempt) + 3600000, wasCorrect: reps > 0 }],
  reviewState: { totalReviews: 2, repetitions: reps, dueDate: day(due), lastReviewedAt: day(last) + 3600000 },
});

test("days left counts today and goes negative once it has passed", () => {
  assert.equal(daysLeft(day(10), NOW), 10);
  assert.equal(daysLeft(day(1), NOW), 1);
  assert.equal(daysLeft(day(0), NOW), 0);
  assert.equal(daysLeft(day(-1), NOW), -1);
  assert.ok(isActive(day(0), NOW));
  assert.ok(!isActive(day(-1), NOW));
  assert.ok(!isActive(undefined, NOW));
});

test("reserved review days depend on the notice given, not on today", () => {
  assert.equal(reserveDays({ date: day(14), setOn: day(0) }), 2);
  assert.equal(reserveDays({ date: day(5), setOn: day(0) }), 1);
  assert.equal(reserveDays({ date: day(3), setOn: day(0) }), 0);
  // Two weeks' notice still keeps 2 days even when only 2 are left.
  assert.equal(reserveDays({ date: day(2), setOn: day(-12) }), 2);
});

test("reviews due before the interview keep their date", () => {
  const s = { dueDate: day(3), lastReviewedAt: day(-3) };
  assert.equal(effectiveDue(s, day(10), "x", NOW), day(3));
});

test("reviews due after the interview move into the last three days before it", () => {
  for (let i = 0; i < 40; i++) {
    const due = effectiveDue({ dueDate: day(30), lastReviewedAt: day(-2) }, day(10), `id${i}`, NOW);
    assert.ok(due >= day(7) && due <= day(9), `landed on day ${(due - day(0)) / 86400000}`);
  }
});

test("a pulled-in review is never due before the day after its last answer", () => {
  const due = effectiveDue({ dueDate: day(6), lastReviewedAt: day(0) + 1000 }, day(2), "abc", NOW);
  assert.equal(due, day(1));
  // Answered today with the interview tomorrow: no day left to fit it in.
  const none = effectiveDue({ dueDate: day(1), lastReviewedAt: day(0) + 1000 }, day(1), "abc", NOW);
  assert.equal(none, day(1));
});

test("withInterviewDue copies states and leaves unseen and passed plans alone", () => {
  const q = seen({ due: 30 });
  const pool = [q, unseen()];
  const out = withInterviewDue(pool, day(10), NOW);
  assert.notEqual(out[0].reviewState, q.reviewState);
  assert.equal(q.reviewState.dueDate, day(30));
  assert.ok(out[0].reviewState.dueDate < day(10));
  assert.equal(out[1], pool[1]);
  assert.equal(withInterviewDue(pool, day(-1), NOW), pool);
});

test("unseen questions are paced over the learning days", () => {
  const pool = Array.from({ length: 100 }, () => unseen());
  // 10 days left with 2 reserved → 8 learning days → 13 a day.
  const plan = planToday(pool, { date: day(10), setOn: day(0) }, 15, NOW);
  assert.equal(plan.newPerDay, 13);
  assert.equal(plan.newToday, 13);
  assert.equal(plan.reviewOnly, false);
  assert.equal(plan.size, 15);
});

test("finishing today's share doesn't raise today's ask", () => {
  const iv = { date: day(10), setOn: day(0) };
  const before = Array.from({ length: 80 }, () => unseen());
  const p1 = planToday(before, iv, 15, NOW);
  const after = [
    ...before.slice(p1.newToday),
    ...Array.from({ length: p1.newToday }, () => seen({ due: 1, last: 0, firstAttempt: 0 })),
  ];
  const p2 = planToday(after, iv, 15, NOW);
  assert.equal(p2.newPerDay, p1.newPerDay);
  assert.equal(p2.newToday, 0);
});

test("the reserved final days and the day itself take no new questions", () => {
  const pool = [unseen(), seen({ due: 0 })];
  const last = planToday(pool, { date: day(2), setOn: day(-12) }, 15, NOW);
  assert.equal(last.reviewOnly, true);
  assert.equal(last.newToday, 0);
  assert.equal(last.dueToday, 1);
  const dayOf = planToday(pool, { date: day(0), setOn: day(-1) }, 15, NOW);
  assert.equal(dayOf.reviewOnly, true);
});

test("session size grows with the plan, capped and flagged when behind", () => {
  const pool = Array.from({ length: 500 }, () => unseen());
  const plan = planToday(pool, { date: day(3), setOn: day(0) }, 15, NOW);
  assert.equal(plan.size, MAX_SESSION);
  assert.equal(plan.behind, true);
});

test("composeSession honours an exact new-question limit", () => {
  const pool = Array.from({ length: 30 }, () => unseen());
  assert.equal(composeSession(pool, { size: 15, newLimit: 4 }).new, 4);
  assert.equal(composeSession(pool, { size: 15, newLimit: 0 }).total, 0);
  // Without it the old top-up still fills the session.
  assert.equal(composeSession(pool, { size: 15, newLimitRatio: 0.2 }).total, 15);
});

test("readiness counts latest-correct questions, weakest topic first", () => {
  const pool = [
    seen({ topic: "Graphs", reps: 0 }),
    unseen("Graphs"),
    seen({ topic: "Arrays", reps: 2 }),
    seen({ topic: "Arrays", reps: 1 }),
    unseen("Arrays"),
  ];
  const r = readiness(pool);
  assert.equal(r.ready, 2);
  assert.equal(r.total, 5);
  assert.deepEqual(r.topics.map((t) => [t.topic, t.ready, t.total]), [["Graphs", 0, 2], ["Arrays", 2, 3]]);
  assert.equal(readiness([]).rate, 0);
});
