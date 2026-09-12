import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDeck, validateDeck } from "../src/schema.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const sample = (name) =>
  readFileSync(fileURLToPath(new URL(`../samples/${name}`, import.meta.url)), "utf8");

test("rejects empty input", () => {
  const r = parseDeck("   ");
  assert.equal(r.ok, false);
});

test("rejects non-JSON", () => {
  const r = parseDeck("{not json");
  assert.equal(r.ok, false);
});

test("rejects a top-level array", () => {
  const r = parseDeck("[]");
  assert.equal(r.ok, false);
});

test("bundled sample decks are valid", () => {
  for (const name of ["course.json", "leetcode.json"]) {
    const parsed = parseDeck(sample(name));
    assert.equal(parsed.ok, true, `${name} parses`);
    const v = validateDeck(parsed.dto);
    assert.equal(v.errors.length, 0, `${name} has no errors: ${JSON.stringify(v.errors)}`);
    assert.ok(v.questionCount > 0);
  }
});

test("flags bad enums, choice counts and correct_index", () => {
  const dto = {
    deck_name: "",
    source_type: "lecture",
    items: [
      {
        title: "X",
        topic: "",
        difficulty: "trivial",
        context: "",
        questions: [
          { type: "essay", prompt: "", choices: ["only one"], correct_index: 4, explanation: "" },
        ],
      },
    ],
  };
  const v = validateDeck(dto);
  const paths = v.errors.map((e) => e.path);
  assert.ok(paths.includes("deck_name"));
  assert.ok(paths.includes("source_type"));
  assert.ok(paths.includes("items[0].difficulty"));
  assert.ok(paths.includes("items[0].questions[0].type"));
  assert.ok(paths.includes("items[0].questions[0].prompt"));
  assert.ok(paths.includes("items[0].questions[0].choices"));
  assert.ok(paths.includes("items[0].questions[0].correct_index"));
  assert.equal(v.importable, false);
});

test("missing id / topic / explanation are warnings, not errors", () => {
  const dto = {
    deck_name: "D",
    source_type: "course",
    items: [
      {
        title: "T",
        difficulty: "easy",
        questions: [{ type: "mcq", prompt: "P", choices: ["a", "b"], correct_index: 0 }],
      },
    ],
  };
  const v = validateDeck(dto);
  assert.equal(v.importable, true);
  assert.ok(v.warnings.length >= 2);
});
