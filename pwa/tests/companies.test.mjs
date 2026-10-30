import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COMPANIES, companyByKey, companyRoadmapKey, companyOfRoadmapKey, trackStages, trackSummary } from "../src/companies.js";
import { hasFeature } from "../src/plan.js";

const libraryIndex = (key) => JSON.parse(readFileSync(new URL(`../library/${key}/index.json`, import.meta.url), "utf8"));

test("company keys are unique", () => {
  assert.equal(companyByKey.size, COMPANIES.length);
});

test("every track stage points at real built-in content, once", () => {
  for (const c of COMPANIES) {
    const stages = trackStages(c); // throws on an unknown pattern or library
    assert.ok(stages.length >= 8, `${c.key} track is too short`);
    const refs = c.track.map(([ref]) => ref);
    assert.equal(new Set(refs).size, refs.length, `${c.key} lists a stage twice`);
    for (const s of stages) {
      assert.ok(s.why, `${c.key}: every stage says why it's there`);
      assert.ok(s.title, `${c.key}: every stage has a title`);
      if (s.kind === "pattern") assert.equal(s.path.patterns[s.index], s.pattern);
      else assert.ok(libraryIndex(s.lib.key).some((e) => e.id === s.deckId), `${c.key}: ${s.lib.key} has no deck ${s.deckId}`);
    }
  }
});

test("every profile has rounds and tips", () => {
  for (const c of COMPANIES) {
    assert.ok(c.rounds.length >= 3 && c.rounds.every((r) => r.name && r.what), c.key);
    assert.ok(c.tips.length >= 2, c.key);
  }
});

test("a company roadmap key maps back to its company, and nothing else does", () => {
  for (const c of COMPANIES) assert.equal(companyOfRoadmapKey(companyRoadmapKey(c)), c);
  assert.equal(companyOfRoadmapKey("lc-patterns"), null);
  assert.equal(companyOfRoadmapKey("company:nope"), null);
  assert.equal(companyOfRoadmapKey(undefined), null);
});

test("track summary counts patterns and library decks", () => {
  assert.equal(trackSummary(companyByKey.get("microsoft")), "11 patterns · 2 library decks");
});

test("company prep is a live Pro feature", () => {
  assert.ok(hasFeature("pro", "company-prep"));
  assert.ok(!hasFeature("free", "company-prep"));
});
