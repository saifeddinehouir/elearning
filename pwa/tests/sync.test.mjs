import { test } from "node:test";
import assert from "node:assert/strict";
import {
  snapshotToRecords,
  resolvePull,
  computePush,
  markPushed,
  hashData,
  stableStringify,
  mergeConflict,
  studyDaysFromAttempts,
  recordId,
  splitId,
  sortForApply,
} from "../src/sync.js";

// ---------- A fake cloud and in-memory devices ----------

function fakeCloud() {
  const docs = new Map();
  let clock = 0;
  return {
    docs,
    async pull(cursor) {
      const changes = [...docs.values()]
        .filter((d) => d.ts > (cursor ?? 0))
        .sort((a, b) => a.ts - b.ts)
        .map((d) => ({ id: d.id, kind: d.kind, key: d.key, data: d.deleted ? null : structuredClone(d.data), hash: d.hash }));
      const last = changes.length ? Math.max(...[...docs.values()].map((d) => d.ts)) : cursor;
      return { changes, cursor: last ?? null };
    },
    async push(list) {
      clock += 1;
      for (const p of list) docs.set(p.id, { id: p.id, kind: p.kind, key: p.key, data: structuredClone(p.data), hash: p.hash, deleted: p.data == null, ts: clock });
      return { pushed: list, skipped: [] };
    },
  };
}

function device() {
  return { records: new Map(), synced: new Map(), cursor: null };
}
const set = (dev, kind, key, data) => dev.records.set(recordId(kind, key), { kind, key, data });
const get = (dev, kind, key) => dev.records.get(recordId(kind, key))?.data;

// Mirrors sync-client.runSync, with "apply" writing straight into the device.
async function sync(dev, cloud) {
  const { changes, cursor } = await cloud.pull(dev.cursor);
  const { toApply, synced } = resolvePull(dev.records, dev.synced, changes);
  for (const r of toApply) {
    if (r.data == null) dev.records.delete(r.id);
    else dev.records.set(r.id, { kind: r.kind, key: r.key, data: r.data });
  }
  const { pushed } = await cloud.push(computePush(dev.records, synced));
  dev.synced = markPushed(synced, pushed);
  dev.cursor = cursor;
  return { applied: toApply.length, pushed: pushed.length };
}

// ---------- Engine ----------

test("hashing ignores key order", () => {
  assert.equal(stableStringify({ b: 1, a: [1, { d: 2, c: 3 }] }), '{"a":[1,{"c":3,"d":2}],"b":1}');
  assert.equal(hashData({ x: 1, y: 2 }), hashData({ y: 2, x: 1 }));
  assert.notEqual(hashData({ x: 1 }), hashData({ x: 2 }));
});

test("record ids split back into kind and key, even when the key has colons", () => {
  assert.deepEqual(splitId(recordId("mix", "l:java-spring:java-8")), { kind: "mix", key: "l:java-spring:java-8" });
});

test("a fresh device receives everything another device pushed", async () => {
  const cloud = fakeCloud();
  const a = device();
  set(a, "review", "q1", { questionId: "q1", lastReviewedAt: 10, totalReviews: 1 });
  set(a, "attempt", "s1", { questionId: "q1", date: 10, wasCorrect: true });
  set(a, "settings", "all", { dailyGoal: 20 });
  await sync(a, cloud);

  const b = device();
  const r = await sync(b, cloud);
  assert.equal(r.applied, 3);
  assert.deepEqual(get(b, "review", "q1"), get(a, "review", "q1"));
  assert.equal(get(b, "settings", "all").dailyGoal, 20);
  assert.equal(r.pushed, 0, "nothing to send back");
});

test("changes flow both ways and our own writes don't bounce back", async () => {
  const cloud = fakeCloud();
  const a = device();
  const b = device();
  set(a, "attempt", "a1", { date: 1 });
  await sync(a, cloud);
  await sync(b, cloud);
  set(b, "attempt", "b1", { date: 2 });
  await sync(b, cloud);
  const back = await sync(a, cloud);
  assert.ok(get(a, "attempt", "b1"));
  assert.equal(back.applied, 1, "only b's new answer applies on a");
  const again = await sync(a, cloud);
  assert.deepEqual(again, { applied: 0, pushed: 0 });
});

test("a review edited on both devices keeps the most recent review everywhere", async () => {
  const cloud = fakeCloud();
  const a = device();
  const b = device();
  set(a, "review", "q", { lastReviewedAt: 1, interval: 1, totalReviews: 1 });
  await sync(a, cloud);
  await sync(b, cloud);
  set(a, "review", "q", { lastReviewedAt: 50, interval: 6, totalReviews: 2 }); // older edit
  set(b, "review", "q", { lastReviewedAt: 90, interval: 1, totalReviews: 2 }); // newer edit
  await sync(a, cloud);
  await sync(b, cloud); // b keeps its newer one and pushes it
  await sync(a, cloud); // a takes b's
  assert.equal(get(a, "review", "q").lastReviewedAt, 90);
  assert.equal(get(b, "review", "q").lastReviewedAt, 90);
});

test("deletions propagate as tombstones and stay deleted", async () => {
  const cloud = fakeCloud();
  const a = device();
  const b = device();
  set(a, "flag", "q", { reason: "wrong" });
  await sync(a, cloud);
  await sync(b, cloud);
  a.records.delete(recordId("flag", "q"));
  await sync(a, cloud);
  await sync(b, cloud);
  assert.equal(get(b, "flag", "q"), undefined);
  await sync(a, cloud);
  assert.equal(get(a, "flag", "q"), undefined, "not resurrected");
});

test("a device joining the account takes the cloud's settings over its defaults", async () => {
  const cloud = fakeCloud();
  const a = device();
  set(a, "settings", "all", { dailyGoal: 30, theme: "dark" });
  await sync(a, cloud);
  const b = device();
  set(b, "settings", "all", { dailyGoal: 15, theme: "system" }); // fresh defaults
  await sync(b, cloud);
  assert.deepEqual(get(b, "settings", "all"), { dailyGoal: 30, theme: "dark" });
  await sync(a, cloud);
  assert.equal(get(a, "settings", "all").dailyGoal, 30, "a isn't overwritten by b's defaults");
});

test("after joining, a newer local settings change wins and reaches the other device", async () => {
  const cloud = fakeCloud();
  const a = device();
  const b = device();
  set(a, "settings", "all", { dailyGoal: 30 });
  await sync(a, cloud);
  await sync(b, cloud);
  set(b, "settings", "all", { dailyGoal: 10 });
  await sync(b, cloud);
  await sync(a, cloud);
  assert.equal(get(a, "settings", "all").dailyGoal, 10);
});

test("delete on one device vs edit on the other keeps the data", async () => {
  const cloud = fakeCloud();
  const a = device();
  const b = device();
  set(a, "roadmap", "r", { name: "Plan" });
  await sync(a, cloud);
  await sync(b, cloud);
  a.records.delete(recordId("roadmap", "r"));
  set(b, "roadmap", "r", { name: "Plan v2" });
  await sync(a, cloud); // tombstone up
  await sync(b, cloud); // b edited: keeps it and pushes it back
  await sync(a, cloud);
  assert.equal(get(a, "roadmap", "r").name, "Plan v2");
  assert.equal(get(b, "roadmap", "r").name, "Plan v2");
});

test("challenge conflicts keep the best score and the first completion", () => {
  const merged = mergeConflict(
    "challenge",
    { dayStart: 1, bestScore: 4, score: 4, total: 6, completedAt: 200, plays: 1, questionIds: ["a"] },
    { dayStart: 1, bestScore: 6, score: 6, total: 6, completedAt: 100, plays: 2, questionIds: ["a"] }
  );
  assert.equal(merged.bestScore, 6);
  assert.equal(merged.completedAt, 100);
  assert.equal(merged.plays, 2);
});

test("structural records apply before the progress that points at them", () => {
  const order = sortForApply([{ kind: "review" }, { kind: "attempt" }, { kind: "path" }, { kind: "deck" }, { kind: "settings" }]).map((r) => r.kind);
  assert.deepEqual(order, ["settings", "path", "deck", "review", "attempt"]);
});

// ---------- Snapshot → records ----------

test("snapshots sync progress portably, and built-in content only as a reference", () => {
  const snap = {
    decks: [
      { id: "local-1", name: "Pattern 01", builtinKey: "hashing", includeInMix: true },
      { id: "local-2", name: "Java 8", libraryKey: "java-spring:java-8-features", includeInMix: false },
      { id: "mine", name: "My deck", sourceType: "course", includeInMix: true },
    ],
    items: [{ id: "i1", deckId: "mine", title: "T" }, { id: "i9", deckId: "local-1", title: "built-in" }],
    questions: [{ id: "q1", deckId: "mine", itemId: "i1", prompt: "?" }, { id: "q9", deckId: "local-1", itemId: "i9" }],
    reviewState: [{ questionId: "q9", deckId: "local-1", lastReviewedAt: 5 }],
    attempts: [{ id: 7, syncId: "s7", questionId: "q9", date: 5 }, { id: 8, questionId: "q9", date: 6 }],
    flags: [{ questionId: "q1", deckId: "mine", reason: "wrong" }],
    roadmaps: [
      { id: "rm1", builtin: "lc-patterns", nodes: [{ id: "n", deckId: "local-1" }] },
      { id: "rm2", name: "Mine", nodes: [{ id: "a", deckId: "local-2" }, { id: "b", deckId: "mine" }, { id: "c", deckId: null }] },
    ],
    challenges: [{ dayStart: 100, challengeId: "big-o" }],
    settings: { dailyGoal: 15 },
  };
  const recs = snapshotToRecords(snap);
  const data = (id) => recs.get(id)?.data;

  assert.deepEqual(data("mix:b:hashing"), { includeInMix: true });
  assert.deepEqual(data("mix:l:java-spring:java-8-features"), { includeInMix: false });
  assert.equal(recs.has("deck:local-1"), false, "built-in content isn't uploaded");
  assert.equal(data("deck:mine").questions.length, 1);
  assert.equal(data("deck:mine").questions[0].deckId, undefined, "local deck ids stripped");
  assert.deepEqual(data("path:lc-patterns"), { installed: true });
  assert.deepEqual(
    data("roadmap:rm2").nodes.map((n) => n.deck),
    [{ ref: "l:java-spring:java-8-features" }, { deckId: "mine" }, null]
  );
  assert.equal(data("review:q9").deckId, undefined);
  assert.equal(recs.has("attempt:s7"), true);
  assert.equal(data("attempt:s7").id, undefined, "local autoincrement id stripped");
  assert.equal([...recs.keys()].filter((k) => k.startsWith("attempt:")).length, 1, "answers without a sync id wait for one");
  assert.ok(recs.has("challenge:100") && recs.has("settings:all") && recs.has("flag:q1"));
});

test("the same progress on two devices yields identical records despite different local ids", () => {
  const base = { items: [], questions: [], attempts: [], flags: [], challenges: [], settings: { dailyGoal: 15 } };
  const a = snapshotToRecords({ ...base, decks: [{ id: "x1", builtinKey: "hashing", includeInMix: true }], reviewState: [{ questionId: "q", deckId: "x1", interval: 6 }], roadmaps: [{ id: "r-a", builtin: "lc-patterns", nodes: [] }] });
  const b = snapshotToRecords({ ...base, decks: [{ id: "y7", builtinKey: "hashing", includeInMix: true }], reviewState: [{ questionId: "q", deckId: "y7", interval: 6 }], roadmaps: [{ id: "r-b", builtin: "lc-patterns", nodes: [] }] });
  assert.deepEqual([...a.keys()].sort(), [...b.keys()].sort());
  for (const [id, rec] of a) assert.equal(hashData(rec.data), hashData(b.get(id).data), id);
});

test("study days rebuilt from both devices' answers add up per day", () => {
  const day = (ms) => Math.floor(ms / 1000) * 1000;
  const days = studyDaysFromAttempts(
    [{ date: 1000, wasCorrect: true }, { date: 1500, wasCorrect: false }, { date: 2100, wasCorrect: true }],
    2,
    day
  );
  const byDay = Object.fromEntries(days.map((d) => [d.dayStart, d]));
  assert.deepEqual(byDay[1000], { dayStart: 1000, answered: 2, correct: 1, completedGoal: true });
  assert.equal(byDay[2000].answered, 1);
  assert.equal(byDay[2000].completedGoal, false);
});
