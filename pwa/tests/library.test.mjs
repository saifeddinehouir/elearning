import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { LIBRARIES } from "../src/library.js";
import { validateDeck } from "../src/schema.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));

for (const lib of LIBRARIES) {
  const index = read(`${lib.dir}index.json`);

  test(`${lib.name}: index matches the files on disk and the advertised counts`, () => {
    const onDisk = readdirSync(join(root, lib.dir)).filter((f) => f !== "index.json").map((f) => f.replace(/\.json$/, "")).sort();
    assert.deepEqual([...index.map((d) => d.id)].sort(), onDisk);
    assert.equal(index.length, lib.deckCount);
    assert.equal(index.reduce((s, d) => s + d.questions, 0), lib.questionCount);
  });

  test(`${lib.name}: every deck imports cleanly and matches its index entry`, () => {
    const ids = new Set();
    for (const entry of index) {
      const dto = read(`${lib.dir}${entry.id}.json`);
      const v = validateDeck(dto);
      assert.equal(v.errors.length, 0, `${entry.id}: ${JSON.stringify(v.errors.slice(0, 3))}`);
      assert.equal(dto.deck_name, entry.name);
      assert.equal(v.questionCount, entry.questions);
      for (const it of dto.items) for (const q of [it, ...it.questions]) {
        assert.ok(!ids.has(q.id), `duplicate id ${q.id}`);
        ids.add(q.id);
      }
    }
  });

  test(`${lib.name}: correct answers aren't bunched on one letter`, () => {
    const pos = [0, 0, 0, 0, 0, 0];
    let n = 0;
    for (const entry of index) {
      for (const it of read(`${lib.dir}${entry.id}.json`).items) for (const q of it.questions) {
        pos[q.correct_index] += 1;
        n += 1;
      }
    }
    assert.ok(Math.max(...pos) / n < 0.35, `answers bunch up: ${pos}`);
  });
}
