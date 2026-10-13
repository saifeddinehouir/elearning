import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]
  );
}

// The offline app shell must list every module, or the app breaks offline the
// first time it imports a file that was never precached.
test("sw.js precaches every source module", () => {
  const sw = readFileSync(join(root, "sw.js"), "utf8");
  const missing = walk(join(root, "src"))
    .filter((f) => f.endsWith(".js"))
    .map((f) => relative(root, f).split("\\").join("/"))
    .filter((path) => !sw.includes(`"${path}"`));
  assert.deepEqual(missing, [], `add these to SHELL in sw.js: ${missing.join(", ")}`);
});
