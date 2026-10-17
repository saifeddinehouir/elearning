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

test("sign-in errors read as plain sentences, and typos are caught before a request", async () => {
  const { authErrorMessage, checkCredentials } = await import("../src/auth-errors.js");
  assert.equal(authErrorMessage({ code: "auth/invalid-credential" }), "Wrong email or password.");
  assert.match(authErrorMessage({ code: "auth/email-already-in-use" }), /Sign in instead/);
  assert.equal(authErrorMessage({ code: "auth/something-new" }), "Couldn't sign in. Try again.");
  assert.equal(checkCredentials({ email: "", password: "x" }), "Enter your email.");
  assert.match(checkCredentials({ email: "nope", password: "x" }), /doesn't look right/);
  assert.equal(checkCredentials({ email: "a@b.co", password: "" }), "Enter your password.");
  assert.match(checkCredentials({ email: "a@b.co", password: "12345", creating: true }), /6 characters/);
  assert.equal(checkCredentials({ email: " a@b.co ", password: "12345" }), null);
});

test("Today greets by first name when there is one", async () => {
  const { greetingFor, firstName } = await import("../src/format.js");
  assert.equal(greetingFor(9, "Saif Eddine Houir"), "Good morning, Saif");
  assert.equal(greetingFor(14, "  Salma "), "Good afternoon, Salma");
  assert.equal(greetingFor(20, null), "Good evening");
  assert.equal(greetingFor(3, ""), "Late night");
  assert.equal(firstName("x".repeat(40)).length, 24);
});

test("the account avatar shows initials, falling back to the email", async () => {
  const { initials } = await import("../src/format.js");
  assert.equal(initials("Saif Eddine Houir"), "SE");
  assert.equal(initials("salma"), "S");
  assert.equal(initials("", "zed@x.test"), "Z");
  assert.equal(initials(null, ""), "?");
});
