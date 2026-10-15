import { test } from "node:test";
import assert from "node:assert/strict";
import { PATHS, PATTERNS, patternById, pathOfPattern, buildPatternDeck, isStageDone, MASTERY } from "../src/patterns.js";
import { validateDeck } from "../src/schema.js";
import { stableUuid } from "../src/random.js";
import { UUID_RE } from "../src/format.js";

const built = PATHS.map((path) => ({ path, decks: path.patterns.map((p, i) => buildPatternDeck(p, i, path)) }));
const allDecks = built.flatMap((b) => b.decks);

test("every built-in pattern deck passes the import validator with no errors or warnings", () => {
  for (const dto of allDecks) {
    const v = validateDeck(dto);
    assert.equal(v.errors.length, 0, `${dto.deck_name}: ${JSON.stringify(v.errors)}`);
    assert.equal(v.warnings.length, 0, `${dto.deck_name}: ${JSON.stringify(v.warnings)}`);
  }
});

test("pattern ids and names are unique across every path", () => {
  const all = PATHS.flatMap((p) => p.patterns);
  assert.equal(patternById.size, all.length, "duplicate pattern id");
  assert.equal(new Set(all.map((p) => p.name)).size, all.length, "duplicate pattern name");
  assert.equal(new Set(PATHS.map((p) => p.key)).size, PATHS.length);
  assert.equal(new Set(PATHS.map((p) => p.idPrefix)).size, PATHS.length);
  for (const p of all) assert.ok(pathOfPattern.get(p.id), `${p.id} has no path`);
});

test("every confuser is another real pattern, with enough for the path's decoy count", () => {
  for (const path of PATHS) {
    for (const p of path.patterns) {
      assert.ok(p.confusers.length >= path.decoys, `${p.id} needs ≥ ${path.decoys} confusers`);
      assert.equal(new Set(p.confusers).size, p.confusers.length, `${p.id} repeats a confuser`);
      for (const c of p.confusers) {
        assert.ok(patternById.has(c), `${p.id} → unknown confuser ${c}`);
        assert.notEqual(c, p.id, `${p.id} lists itself as a confuser`);
      }
    }
  }
});

test("all item and question ids are valid and unique across every path", () => {
  const ids = new Set();
  for (const dto of allDecks) {
    for (const it of dto.items) {
      for (const id of [it.id, ...it.questions.map((q) => q.id)]) {
        assert.match(id, UUID_RE);
        assert.ok(!ids.has(id), `duplicate id ${id}`);
        ids.add(id);
      }
    }
  }
});

test("building is deterministic, so reinstalls keep the same ids and answer positions", () => {
  const again = PATHS.map((path) => path.patterns.map((p, i) => buildPatternDeck(p, i, path)));
  assert.deepEqual(again.flat(), allDecks);
  // The core path's default arguments must keep producing exactly what shipped.
  assert.deepEqual(PATTERNS.map((p, i) => buildPatternDeck(p, i)), built[0].decks);
  assert.equal(stableUuid("x"), stableUuid("x"));
  assert.notEqual(stableUuid("x"), stableUuid("y"));
});

test("recognition questions offer the right pattern plus the path's number of distinct decoys", () => {
  for (const { path, decks } of built) {
    decks.forEach((dto, i) => {
      for (const it of dto.items) {
        const recog = it.questions[0];
        assert.equal(recog.type, "approach");
        assert.equal(recog.choices[recog.correct_index], path.patterns[i].name);
        assert.equal(recog.choices.length, path.decoys + 1, `${it.title}: wrong choice count`);
        assert.equal(new Set(recog.choices).size, recog.choices.length, `${it.title}: duplicate choices`);
      }
    });
  }
});

test("the advanced path is harder: 5-way recognition, mastery unlocks, mostly hard problems", () => {
  const adv = PATHS.find((p) => p.tone === "hard");
  assert.ok(adv);
  assert.equal(adv.decoys, 4);
  assert.equal(adv.unlock, "mastery");
  const problems = adv.patterns.flatMap((p) => p.problems);
  assert.ok(problems.filter((p) => p.difficulty === "hard").length / problems.length > 0.5);
  assert.ok(problems.every((p) => p.difficulty !== "easy"));
});

test("shuffling spreads correct answers across positions instead of always A", () => {
  const counts = [0, 0, 0, 0, 0];
  for (const dto of allDecks) for (const it of dto.items) for (const q of it.questions) counts[q.correct_index] += 1;
  for (const c of counts.slice(0, 4)) assert.ok(c > 0, `a position is never correct: ${counts}`);
  const total = counts.reduce((a, b) => a + b, 0);
  assert.ok(Math.max(...counts) / total < 0.4, `answers bunch up: ${counts}`);
});

test("stage completion follows the path's unlock rule", () => {
  const seenWeak = { studiedFraction: 1, mastery: MASTERY - 0.1 };
  const seenStrong = { studiedFraction: 1, mastery: MASTERY };
  const half = { studiedFraction: 0.5, mastery: 1 };
  assert.equal(isStageDone(seenWeak, "seen"), true);
  assert.equal(isStageDone(seenWeak, "mastery"), false);
  assert.equal(isStageDone(seenStrong, "mastery"), true);
  assert.equal(isStageDone(half, "mastery"), false);
  assert.equal(isStageDone(null, "seen"), false);
});

test("former path names never collide with a current one", () => {
  const current = new Set(PATHS.map((p) => p.name));
  for (const p of PATHS) for (const old of p.formerNames || []) assert.ok(!current.has(old), `${p.key}: "${old}" is still a current name`);
});
