import { test } from "node:test";
import assert from "node:assert/strict";
import { effectivePlan, canInstallPath, libraryEntriesFor, hasFeature, FREE_LIBRARY_DECKS, PRO_FEATURES } from "../src/plan.js";
import { PATHS, PATTERN_PATH } from "../src/patterns.js";

test("everyone is Pro until enforcement is on", () => {
  assert.equal(effectivePlan(null, false), "pro");
  assert.equal(effectivePlan(null, true), "free");
});

test("a valid override wins either way; junk is ignored", () => {
  assert.equal(effectivePlan("free", false), "free");
  assert.equal(effectivePlan("pro", true), "pro");
  assert.equal(effectivePlan("gold", true), "free");
  assert.equal(effectivePlan("", false), "pro");
});

test("the core path is free, every other path needs Pro", () => {
  assert.ok(canInstallPath("free", PATTERN_PATH.key));
  for (const p of PATHS.filter((p) => p.key !== PATTERN_PATH.key)) {
    assert.ok(!canInstallPath("free", p.key), p.key);
    assert.ok(canInstallPath("pro", p.key), p.key);
  }
});

test("free gets the first library decks in order, Pro gets all", () => {
  const index = ["a", "b", "c", "d"].map((id) => ({ id }));
  assert.deepEqual(libraryEntriesFor("free", index).map((e) => e.id), ["a", "b"].slice(0, FREE_LIBRARY_DECKS));
  assert.equal(libraryEntriesFor("pro", index), index);
});

test("only live Pro features are usable, and only on Pro", () => {
  const live = PRO_FEATURES.find((f) => f.live);
  const soon = PRO_FEATURES.find((f) => !f.live);
  assert.ok(hasFeature("pro", live.id));
  assert.ok(!hasFeature("free", live.id));
  if (soon) assert.ok(!hasFeature("pro", soon.id));
  assert.ok(!hasFeature("pro", "no-such-feature"));
});

test("a server-confirmed plan counts, unless a preview override says otherwise", async () => {
  const { entitledFrom } = await import("../src/plan.js");
  const now = 1_000_000;
  assert.equal(effectivePlan(null, true, true), "pro");
  assert.equal(effectivePlan("free", true, true), "free");
  assert.ok(entitledFrom({ plan: "pro", subscription: true }, now));
  assert.ok(entitledFrom({ plan: "pro", proUntil: now + 1 }, now));
  assert.ok(!entitledFrom({ plan: "pro", proUntil: now - 1 }, now));
  assert.ok(!entitledFrom({ plan: "free", subscription: false }, now));
  assert.ok(!entitledFrom(null, now));
});
