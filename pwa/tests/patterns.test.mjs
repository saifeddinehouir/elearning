import { test } from "node:test";
import assert from "node:assert/strict";
import { PATTERNS, patternById, buildPatternDeck } from "../src/patterns.js";
import { validateDeck } from "../src/schema.js";
import { stableUuid } from "../src/random.js";
import { UUID_RE } from "../src/format.js";

const decks = PATTERNS.map((p, i) => buildPatternDeck(p, i));

test("every built-in pattern deck passes the import validator with no errors or warnings", () => {
  for (const dto of decks) {
    const v = validateDeck(dto);
    assert.equal(v.errors.length, 0, `${dto.deck_name}: ${JSON.stringify(v.errors)}`);
    assert.equal(v.warnings.length, 0, `${dto.deck_name}: ${JSON.stringify(v.warnings)}`);
  }
});

test("pattern ids are unique and every confuser points at another real pattern", () => {
  assert.equal(patternById.size, PATTERNS.length);
  for (const p of PATTERNS) {
    assert.ok(p.confusers.length >= 3, `${p.id} needs at least 3 confusers`);
    for (const c of p.confusers) {
      assert.ok(patternById.has(c), `${p.id} → unknown confuser ${c}`);
      assert.notEqual(c, p.id, `${p.id} lists itself as a confuser`);
    }
  }
});

test("all item and question ids are valid, unique UUIDs", () => {
  const ids = new Set();
  for (const dto of decks) {
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
  const again = PATTERNS.map((p, i) => buildPatternDeck(p, i));
  assert.deepEqual(again, decks);
  assert.equal(stableUuid("x"), stableUuid("x"));
  assert.notEqual(stableUuid("x"), stableUuid("y"));
});

test("recognition questions offer the right pattern plus three distinct decoys", () => {
  for (const [i, dto] of decks.entries()) {
    for (const it of dto.items) {
      const recog = it.questions[0];
      assert.equal(recog.type, "approach");
      assert.equal(recog.choices[recog.correct_index], PATTERNS[i].name);
      assert.equal(new Set(recog.choices).size, 4, `${it.title}: duplicate choices`);
    }
  }
});

test("shuffling spreads correct answers across positions instead of always A", () => {
  const counts = [0, 0, 0, 0];
  for (const dto of decks) for (const it of dto.items) for (const q of it.questions) counts[q.correct_index] += 1;
  for (const c of counts) assert.ok(c > 0, `a position is never correct: ${counts}`);
  const total = counts.reduce((a, b) => a + b, 0);
  assert.ok(Math.max(...counts) / total < 0.45, `answers bunch up: ${counts}`);
});
