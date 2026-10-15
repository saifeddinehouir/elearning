import { test } from "node:test";
import assert from "node:assert/strict";
import { libraryByKey, missingEntries } from "../src/library.js";

test("missing entries are the index decks without a deck from this library", () => {
  const lib = libraryByKey.get("java-spring");
  const index = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const decks = [
    { libraryKey: "java-spring:a" },
    { libraryKey: "devops:b" }, // same id, other library
    { name: "mine" },
  ];
  assert.deepEqual(missingEntries(lib, index, decks).map((e) => e.id), ["b", "c"]);
  assert.deepEqual(missingEntries(lib, index, []).map((e) => e.id), ["a", "b", "c"]);
});
