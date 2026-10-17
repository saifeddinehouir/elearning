import { test } from "node:test";
import assert from "node:assert/strict";
import { gateFor } from "../src/gate.js";
import { isDevHost, effectivePlan, ENFORCE } from "../src/plan.js";

const gate = (status, knownAccount = false, configured = true) => gateFor({ configured, status, knownAccount });

test("without accounts set up, the app is always open", () => {
  for (const s of ["loading", "signed_out", "unavailable"]) assert.equal(gate(s, false, false), "open");
});

test("a new visitor must sign in; a signed-in one gets in", () => {
  assert.equal(gate("loading"), "loading");
  assert.equal(gate("signed_out"), "signin");
  assert.equal(gate("unavailable"), "signin");
  assert.equal(gate("signed_in"), "open");
});

test("someone who signed in here before opens straight away, even offline", () => {
  assert.equal(gate("loading", true), "open");
  assert.equal(gate("unavailable", true), "open");
  // ...but a confirmed sign-out still shows the sign-in screen.
  assert.equal(gate("signed_out", true), "signin");
});

test("plans are enforced, and the preview switch only works on localhost", () => {
  assert.equal(ENFORCE, true);
  assert.equal(effectivePlan(null), "free");
  assert.equal(effectivePlan(null, undefined, true), "pro");
  assert.ok(isDevHost("localhost") && isDevHost("127.0.0.1"));
  for (const h of ["elearning-pwa.vercel.app", "saifeddinehouir.github.io", "localhost.evil.com"]) assert.ok(!isDevHost(h), h);
});
