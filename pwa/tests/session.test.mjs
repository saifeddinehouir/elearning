import { test } from "node:test";
import assert from "node:assert/strict";
import { composeSession, topicSuccessRates } from "../src/session.js";
import { addDays, startOfDay } from "../src/format.js";

let seq = 0;
const newQ = (topic = "Arrays") => ({ id: `q${seq++}`, topic, difficulty: "medium", attempts: [] });

const dueQ = (topic = "Arrays", daysAgo = 1) => ({
  ...newQ(topic),
  reviewState: {
    totalReviews: 3,
    repetitions: 3,
    dueDate: addDays(startOfDay(Date.now()), -daysAgo).getTime(),
  },
});

const futureQ = (topic = "Arrays", daysAhead = 3) => ({
  ...newQ(topic),
  reviewState: {
    totalReviews: 2,
    repetitions: 2,
    dueDate: addDays(startOfDay(Date.now()), daysAhead).getTime(),
  },
});

test("empty pool produces an empty queue", () => {
  const r = composeSession([], { size: 15, newLimitRatio: 0.6 });
  assert.deepEqual(r.queue, []);
  assert.equal(r.total, 0);
});

test("queue is capped at the configured size", () => {
  const qs = Array.from({ length: 40 }, () => newQ());
  const r = composeSession(qs, { size: 15, newLimitRatio: 1 });
  assert.equal(r.queue.length, 15);
});

test("due reviews are taken before new questions", () => {
  const due = Array.from({ length: 5 }, () => dueQ("DP"));
  const fresh = Array.from({ length: 20 }, () => newQ("DP"));
  const r = composeSession([...due, ...fresh], { size: 10, newLimitRatio: 0.6 });
  assert.equal(r.due, 5);
  assert.ok(r.new <= 6);
  assert.equal(r.total, 10);
});

test("short review pool still fills the session from new", () => {
  const due = Array.from({ length: 2 }, () => dueQ("Graphs"));
  const fresh = Array.from({ length: 30 }, () => newQ("Graphs"));
  const r = composeSession([...due, ...fresh], { size: 10, newLimitRatio: 0.5 });
  assert.equal(r.due, 2);
  assert.equal(r.new, 8);
  assert.equal(r.total, 10);
});

test("new ratio caps new when enough due exist", () => {
  const due = Array.from({ length: 8 }, () => dueQ("Graphs"));
  const fresh = Array.from({ length: 30 }, () => newQ("Graphs"));
  const r = composeSession([...due, ...fresh], { size: 10, newLimitRatio: 0.4 });
  assert.equal(r.due, 8);
  assert.equal(r.new, 2);
});

test("pull-ahead reviews fill remaining slots when no new questions", () => {
  const due = Array.from({ length: 2 }, () => dueQ("Trees"));
  const future = Array.from({ length: 10 }, () => futureQ("Trees"));
  const r = composeSession([...due, ...future], { size: 8, newLimitRatio: 0.6 });
  assert.equal(r.due, 2);
  assert.equal(r.new, 0);
  assert.equal(r.ahead, 6);
  assert.equal(r.total, 8);
});

test("topic success rates", () => {
  const weak = { ...newQ("Weak"), attempts: Array.from({ length: 10 }, () => ({ wasCorrect: false })) };
  const strong = { ...newQ("Strong"), attempts: Array.from({ length: 10 }, () => ({ wasCorrect: true })) };
  const rates = topicSuccessRates([weak, strong]);
  assert.equal(rates.Weak, 0);
  assert.equal(rates.Strong, 1);
});

test("queue contains no duplicates", () => {
  const due = Array.from({ length: 5 }, () => dueQ());
  const fresh = Array.from({ length: 5 }, () => newQ());
  const r = composeSession([...due, ...fresh], { size: 15, newLimitRatio: 1 });
  assert.equal(new Set(r.queue.map((q) => q.id)).size, r.queue.length);
});
