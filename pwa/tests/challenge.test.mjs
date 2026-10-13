import { test } from "node:test";
import assert from "node:assert/strict";
import { CHALLENGES, challengeForDay, pickChallenge, challengeStreak, weekDays, msUntilTomorrow } from "../src/challenge.js";
import { addDays, startOfDay } from "../src/format.js";

let seq = 0;
const q = (over = {}) => ({ id: `q${seq++}`, topic: "Arrays", difficulty: "medium", kind: "mcq", attempts: [], ...over });
const byId = (id) => CHALLENGES.find((c) => c.id === id);

// A fixed Wednesday at noon, local time.
const WED = new Date(2026, 9, 14, 12).getTime();

test("one challenge per weekday, ids unique", () => {
  assert.equal(CHALLENGES.length, 7);
  assert.equal(new Set(CHALLENGES.map((c) => c.id)).size, 7);
  assert.equal(challengeForDay(WED).id, CHALLENGES[3].id);
});

test("same pool + same day → same questions; different day → usually different", () => {
  const pool = Array.from({ length: 40 }, () => q({ kind: "approach" }));
  const def = byId("pattern-sprint");
  const a = pickChallenge(pool, def, WED).questions.map((x) => x.id);
  const b = pickChallenge(pool, def, WED + 3600_000).questions.map((x) => x.id);
  const c = pickChallenge(pool, def, addDays(WED, 7).getTime()).questions.map((x) => x.id);
  assert.deepEqual(a, b);
  assert.equal(a.length, def.size);
  assert.notDeepEqual(a, c);
});

test("themed challenges only use matching kinds when there are enough", () => {
  const pool = [...Array.from({ length: 10 }, () => q({ kind: "complexity" })), ...Array.from({ length: 10 }, () => q({ kind: "mcq" }))];
  const r = pickChallenge(pool, byId("big-o"), WED);
  assert.ok(r.themed);
  assert.ok(r.questions.every((x) => x.kind === "complexity"));
});

test("falls back to a mixed set (and says so) when the theme is thin", () => {
  const pool = [q({ kind: "trace" }), ...Array.from({ length: 10 }, () => q({ kind: "mcq" }))];
  const r = pickChallenge(pool, byId("trace"), WED);
  assert.equal(r.themed, false);
  assert.equal(r.questions.length, byId("trace").size);
  assert.equal(new Set(r.questions.map((x) => x.id)).size, r.questions.length, "no duplicates");
});

test("never asks for more questions than exist", () => {
  const r = pickChallenge([q(), q()], byId("speed"), WED);
  assert.equal(r.questions.length, 2);
  assert.equal(pickChallenge([], byId("speed"), WED).questions.length, 0);
});

test("hard mode excludes easy problems", () => {
  const pool = [...Array.from({ length: 8 }, () => q({ difficulty: "easy" })), ...Array.from({ length: 8 }, () => q({ difficulty: "hard" }))];
  const r = pickChallenge(pool, byId("hard-mode"), WED);
  assert.ok(r.questions.every((x) => x.difficulty !== "easy"));
});

test("weak spot targets the lowest-accuracy topic", () => {
  const miss = [{ wasCorrect: false }, { wasCorrect: false }];
  const hit = [{ wasCorrect: true }, { wasCorrect: true }];
  const pool = [
    ...Array.from({ length: 8 }, () => q({ topic: "DP", attempts: miss })),
    ...Array.from({ length: 8 }, () => q({ topic: "Arrays", attempts: hit })),
  ];
  const r = pickChallenge(pool, byId("weak-spot"), WED);
  assert.equal(r.focus, "DP");
  assert.ok(r.questions.every((x) => x.topic === "DP"));
});

test("gauntlet prefers questions with lapses", () => {
  const lapsed = Array.from({ length: 6 }, () => q({ reviewState: { totalReviews: 3, lapses: 2 }, attempts: [{ wasCorrect: false }] }));
  const clean = Array.from({ length: 10 }, () => q({ reviewState: { totalReviews: 3, lapses: 0 }, attempts: [{ wasCorrect: true }] }));
  const r = pickChallenge([...clean, ...lapsed], byId("gauntlet"), WED);
  const lapsedIds = new Set(lapsed.map((x) => x.id));
  assert.ok(r.questions.every((x) => lapsedIds.has(x.id)));
});

test("challenge streak counts consecutive completed days", () => {
  const today = startOfDay(WED).getTime();
  const rec = (daysAgo, done = true) => ({ dayStart: addDays(today, -daysAgo).getTime(), completedAt: done ? 1 : undefined });
  assert.equal(challengeStreak([rec(0), rec(1), rec(2), rec(4)], WED), 3);
  assert.equal(challengeStreak([rec(1), rec(2)], WED), 2, "today not done yet keeps yesterday's streak");
  assert.equal(challengeStreak([rec(0, false), rec(1)], WED), 1, "started-but-unfinished doesn't count");
});

test("week strip runs Monday → Sunday and contains today", () => {
  const days = weekDays(WED);
  assert.equal(days.length, 7);
  assert.equal(new Date(days[0]).getDay(), 1);
  assert.equal(new Date(days[6]).getDay(), 0);
  assert.ok(days.includes(startOfDay(WED).getTime()));
  assert.equal(msUntilTomorrow(WED), 12 * 3600_000);
});
