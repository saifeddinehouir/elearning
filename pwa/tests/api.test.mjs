// Server endpoints with fake services: no SDKs, keys or network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseVideoId, buildRequest, readDeckReply, transcriptProblem, MAX_TRANSCRIPT_CHARS, MODEL } from "../api/_lib/youtube.js";
import { isProEntitled, patchForEvent, uidOfEvent, publicPlan, PASS_DAYS, MONTHLY_VIDEO_LIMIT, monthKey } from "../api/_lib/entitlement.js";
import { createHandler as youtubeHandler } from "../api/youtube-deck.js";
import { createHandler as checkoutHandler } from "../api/checkout.js";
import { createHandler as webhookHandler } from "../api/stripe-webhook.js";
import { createHandler as meHandler } from "../api/me.js";
import { HttpError } from "../api/_lib/http.js";

const NOW = Date.UTC(2026, 9, 15, 12);
const DAY = 86400000;
const TRANSCRIPT = "In this lecture we cover binary search. ".repeat(20);

const deckOutput = (over = {}) => ({
  status: "ok",
  deck_name: "Binary Search",
  source_type: "course",
  items: [
    {
      title: "Halving the range",
      topic: "Binary Search",
      difficulty: "easy",
      context: "Binary search halves a sorted range each step.",
      questions: [{ type: "complexity", prompt: "Time?", choices: ["O(log n)", "O(n)", "O(1)", "O(n log n)"], correct_index: 0, explanation: "Halving gives log n steps." }],
    },
  ],
  ...over,
});
const reply = (out, stop_reason = "end_turn") => ({ stop_reason, content: [{ type: "text", text: JSON.stringify(out) }] });

function fakeDeps(over = {}) {
  const calls = { messages: [], usage: [], checkouts: [], applied: [] };
  const users = { u1: { subscriptionActive: true, usage: {} }, free: {} };
  const deps = {
    env: { APP_URL: "https://app.test", STRIPE_PRICE_PASS: "price_pass", STRIPE_PRICE_YEARLY: "price_year" },
    now: () => NOW,
    calls,
    users,
    async verifyIdToken(token) {
      if (token === "bad") throw new HttpError(401, "signed_out");
      return { uid: token, email: `${token}@x.test` };
    },
    async getUser(uid) { return users[uid] || null; },
    async addVideoUse(uid, month) { calls.usage.push([uid, month]); },
    async createMessage(params) { calls.messages.push(params); return reply(deckOutput()); },
    async createCheckout(params) { calls.checkouts.push(params); return { url: "https://checkout.test/s" }; },
    async constructStripeEvent(raw, sig) {
      if (sig !== "good") throw new HttpError(400, "bad_signature");
      return JSON.parse(raw);
    },
    async applyStripeEventOnce(event, uid, patchFn) {
      const patch = patchFn(users[uid] || null);
      calls.applied.push({ uid, patch });
      return patch ? "applied" : "ignored";
    },
    ...over,
  };
  return deps;
}

const post = (body, token = "u1", path = "youtube-deck") =>
  new Request(`https://app.test/api/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

// ---------- YouTube helpers ----------

test("video ids come out of every common URL shape", () => {
  const id = "dQw4w9WgXcQ";
  for (const u of [
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtube.com/watch?v=${id}&t=42s`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://youtu.be/${id}?si=abc`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube.com/embed/${id}`,
    `https://www.youtube.com/live/${id}`,
    `youtube.com/watch?v=${id}`,
    id,
  ]) assert.equal(parseVideoId(u), id, u);
  for (const u of ["", "https://vimeo.com/123", "https://youtube.com/watch?v=short", "https://youtube.com/@channel", "not a url"]) {
    assert.equal(parseVideoId(u), null, u);
  }
});

test("a pasted transcript is sent inline, without MCP", () => {
  const req = buildRequest({ videoId: "dQw4w9WgXcQ", transcript: TRANSCRIPT, deckName: " Search " });
  assert.equal(req.model, MODEL);
  assert.equal(req.fallbacks, "default");
  assert.deepEqual(req.betas, ["server-side-fallback-2026-07-01"]);
  assert.equal(req.output_config.format.type, "json_schema");
  assert.equal(req.output_config.effort, "high");
  assert.ok(req.messages[0].content.includes(TRANSCRIPT));
  assert.ok(req.messages[0].content.includes("Deck name: Search"));
  assert.equal(req.mcp_servers, undefined);
  assert.equal(req.tools, undefined);
});

test("without a transcript, Claude gets the MCP toolset to fetch it", () => {
  const req = buildRequest({ videoId: "dQw4w9WgXcQ", mcp: { url: "https://mcp.test/mcp", token: "t" } });
  assert.ok(req.betas.includes("mcp-client-2025-11-20"));
  assert.deepEqual(req.mcp_servers, [{ type: "url", url: "https://mcp.test/mcp", name: "transcripts", authorization_token: "t" }]);
  assert.deepEqual(req.tools, [{ type: "mcp_toolset", mcp_server_name: "transcripts" }]);
  assert.ok(req.messages[0].content.includes("transcript tool"));
});

test("every object in the output schema forbids extra properties", () => {
  const walk = (s, path = "root") => {
    if (s.type === "object") {
      assert.equal(s.additionalProperties, false, path);
      assert.deepEqual([...s.required].sort(), Object.keys(s.properties).sort(), path);
      for (const [k, v] of Object.entries(s.properties)) walk(v, `${path}.${k}`);
    }
    if (s.type === "array") walk(s.items, `${path}[]`);
  };
  walk(buildRequest({ videoId: "dQw4w9WgXcQ", transcript: TRANSCRIPT }).output_config.format.schema);
});

test("transcripts that are too short or too long are refused, never cut", () => {
  assert.equal(transcriptProblem("hi"), "transcript_too_short");
  assert.equal(transcriptProblem("x".repeat(MAX_TRANSCRIPT_CHARS + 1)), "transcript_too_long");
  assert.equal(transcriptProblem(TRANSCRIPT), null);
});

test("replies are read into a valid deck or a reason", () => {
  const ok = readDeckReply(reply(deckOutput()));
  assert.equal(ok.ok, true);
  assert.equal(ok.deck.deck_name, "Binary Search");
  assert.equal("status" in ok.deck, false);
  assert.equal(readDeckReply(reply(deckOutput(), "refusal")).code, "refused");
  assert.equal(readDeckReply(reply(deckOutput(), "max_tokens")).code, "too_long");
  assert.equal(readDeckReply(reply(deckOutput({ status: "no_transcript", items: [] }))).code, "no_transcript");
  assert.equal(readDeckReply(reply(deckOutput({ status: "not_educational", items: [] }))).code, "not_educational");
  assert.equal(readDeckReply({ stop_reason: "end_turn", content: [{ type: "text", text: "{oops" }] }).code, "bad_output");
  const broken = deckOutput();
  broken.items[0].questions[0].correct_index = 9;
  assert.equal(readDeckReply(reply(broken)).code, "bad_output");
});

// ---------- Entitlement ----------

test("Pro comes from an active subscription or an unexpired pass", () => {
  assert.equal(isProEntitled(null, NOW), false);
  assert.equal(isProEntitled({ subscriptionActive: true }, NOW), true);
  assert.equal(isProEntitled({ proUntil: NOW + 1 }, NOW), true);
  assert.equal(isProEntitled({ proUntil: NOW - 1 }, NOW), false);
  assert.equal(publicPlan({ proUntil: NOW + DAY, usage: { [monthKey(NOW)]: 3 } }, NOW).videosThisMonth, 3);
});

test("a pass grants 90 days, and a second pass extends the first", () => {
  const ev = { type: "checkout.session.completed", data: { object: { mode: "payment", payment_status: "paid", client_reference_id: "u1", customer: "cus_1" } } };
  assert.equal(uidOfEvent(ev), "u1");
  const first = patchForEvent(ev, null, NOW);
  assert.equal(first.proUntil, NOW + PASS_DAYS * DAY);
  assert.equal(first.stripeCustomerId, "cus_1");
  const second = patchForEvent(ev, { proUntil: first.proUntil }, NOW + 10 * DAY);
  assert.equal(second.proUntil, first.proUntil + PASS_DAYS * DAY);
  assert.equal(patchForEvent({ ...ev, data: { object: { ...ev.data.object, payment_status: "unpaid" } } }, null, NOW), null);
});

test("subscription status changes switch Pro on and off", () => {
  const sub = (type, status) => ({ type, data: { object: { id: "sub_1", status, metadata: { uid: "u1" } } } });
  assert.equal(uidOfEvent(sub("customer.subscription.updated", "active")), "u1");
  assert.equal(patchForEvent(sub("customer.subscription.updated", "active"), null, NOW).subscriptionActive, true);
  assert.equal(patchForEvent(sub("customer.subscription.updated", "past_due"), null, NOW).subscriptionActive, true);
  assert.equal(patchForEvent(sub("customer.subscription.updated", "unpaid"), null, NOW).subscriptionActive, false);
  assert.equal(patchForEvent(sub("customer.subscription.deleted", "active"), null, NOW).subscriptionActive, false);
  assert.equal(patchForEvent({ type: "invoice.paid", data: { object: {} } }, null, NOW), null);
});

// ---------- Handlers ----------

test("youtube-deck: a Pro user with a transcript gets a deck and uses one video", async () => {
  const deps = fakeDeps();
  const res = await youtubeHandler(deps)(post({ url: "https://youtu.be/dQw4w9WgXcQ", transcript: TRANSCRIPT }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.deck.deck_name, "Binary Search");
  assert.equal(body.videosThisMonth, 1);
  assert.deepEqual(deps.calls.usage, [["u1", monthKey(NOW)]]);
});

test("youtube-deck: refusals happen before any model call", async () => {
  const cases = [
    [post({ url: "https://youtu.be/dQw4w9WgXcQ", transcript: TRANSCRIPT }, null), 401, "signed_out", {}],
    [post({ url: "https://vimeo.com/1", transcript: TRANSCRIPT }), 400, "bad_url", {}],
    [post({ url: "https://youtu.be/dQw4w9WgXcQ", transcript: TRANSCRIPT }, "free"), 402, "pro_required", {}],
    [post({ url: "https://youtu.be/dQw4w9WgXcQ", transcript: "short" }), 422, "transcript_too_short", {}],
    [post({ url: "https://youtu.be/dQw4w9WgXcQ" }), 422, "no_transcript", {}],
  ];
  for (const [req, status, code] of cases) {
    const deps = fakeDeps();
    const res = await youtubeHandler(deps)(req);
    assert.equal(res.status, status, code);
    assert.equal((await res.json()).error, code);
    assert.equal(deps.calls.messages.length, 0, code);
  }
  const deps = fakeDeps();
  deps.users.u1.usage = { [monthKey(NOW)]: MONTHLY_VIDEO_LIMIT };
  const res = await youtubeHandler(deps)(post({ url: "https://youtu.be/dQw4w9WgXcQ", transcript: TRANSCRIPT }));
  assert.equal(res.status, 429);
  assert.equal(deps.calls.messages.length, 0);
});

test("youtube-deck: with an MCP server configured, no paste is needed", async () => {
  const deps = fakeDeps();
  deps.env.TRANSCRIPT_MCP_URL = "https://mcp.test/mcp";
  const res = await youtubeHandler(deps)(post({ url: "https://youtu.be/dQw4w9WgXcQ" }));
  assert.equal(res.status, 200);
  assert.equal(deps.calls.messages[0].mcp_servers[0].url, "https://mcp.test/mcp");
});

test("youtube-deck: a failed generation doesn't use up a video", async () => {
  const deps = fakeDeps({ async createMessage() { return reply(deckOutput({ status: "no_transcript", items: [] })); } });
  deps.env.TRANSCRIPT_MCP_URL = "https://mcp.test/mcp";
  const res = await youtubeHandler(deps)(post({ url: "https://youtu.be/dQw4w9WgXcQ" }));
  assert.equal(res.status, 422);
  assert.equal(deps.calls.usage.length, 0);
});

test("checkout: builds the right Stripe session for each offer", async () => {
  const deps = fakeDeps();
  let res = await checkoutHandler(deps)(post({ offer: "pass" }, "free", "checkout"));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).url, "https://checkout.test/s");
  let p = deps.calls.checkouts[0];
  assert.equal(p.mode, "payment");
  assert.equal(p.client_reference_id, "free");
  assert.equal(p.customer_email, "free@x.test");
  assert.equal(p.success_url, "https://app.test/?checkout=success");
  assert.equal(p.subscription_data, undefined);

  res = await checkoutHandler(deps)(post({ offer: "yearly" }, "free", "checkout"));
  p = deps.calls.checkouts[1];
  assert.equal(p.mode, "subscription");
  assert.deepEqual(p.subscription_data, { metadata: { uid: "free" } });

  res = await checkoutHandler(deps)(post({ offer: "yearly" }, "u1", "checkout"));
  assert.equal(res.status, 409);
  res = await checkoutHandler(deps)(post({ offer: "lifetime" }, "free", "checkout"));
  assert.equal(res.status, 400);
});

test("webhook: verifies the signature and applies the event to the right user", async () => {
  const deps = fakeDeps();
  const event = { id: "evt_1", type: "checkout.session.completed", data: { object: { mode: "payment", payment_status: "paid", client_reference_id: "free" } } };
  const req = (sig) => new Request("https://app.test/api/stripe-webhook", { method: "POST", headers: sig ? { "stripe-signature": sig } : {}, body: JSON.stringify(event) });
  assert.equal((await webhookHandler(deps)(req(null))).status, 400);
  assert.equal((await webhookHandler(deps)(req("forged"))).status, 400);
  const res = await webhookHandler(deps)(req("good"));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).result, "applied");
  assert.equal(deps.calls.applied[0].uid, "free");
  assert.equal(deps.calls.applied[0].patch.proUntil, NOW + PASS_DAYS * DAY);
});

test("me: reports the plan; wrong methods are rejected", async () => {
  const deps = fakeDeps();
  const res = await meHandler(deps)(new Request("https://app.test/api/me", { headers: { authorization: "Bearer u1" } }));
  assert.equal((await res.json()).plan, "pro");
  const free = await meHandler(deps)(new Request("https://app.test/api/me", { headers: { authorization: "Bearer free" } }));
  assert.equal((await free.json()).plan, "free");
  assert.equal((await meHandler(deps)(post({}, "u1", "me"))).status, 405);
  assert.equal((await meHandler(deps)(new Request("https://app.test/api/me", { headers: { authorization: "Bearer bad" } }))).status, 401);
});

test("service-account setup problems are named, never echoed", async () => {
  const { parseServiceAccount } = await import("../api/_lib/services.js");
  assert.equal(parseServiceAccount("").problem, "not_configured");
  assert.equal(parseServiceAccount("{oops").problem, "service_account_not_json");
  assert.equal(parseServiceAccount('{"apiKey":"x"}').problem, "service_account_wrong_file");
  assert.equal(parseServiceAccount('{"type":"service_account","project_id":"p"}').problem, "service_account_incomplete");
  const ok = parseServiceAccount(JSON.stringify({ type: "service_account", project_id: "p", client_email: "e", private_key: "-----BEGIN-----\nabc\n-----END-----" }));
  assert.equal(ok.problem, undefined);
  assert.deepEqual(ok.account, { projectId: "p", clientEmail: "e", privateKey: "-----BEGIN-----\nabc\n-----END-----" });
  // Leading/trailing whitespace from a paste is fine.
  assert.ok(parseServiceAccount(`  ${JSON.stringify({ type: "service_account", project_id: "p", client_email: "e", private_key: "k" })}\n`).account);
});

test("offers: only priced offers are listed, with Stripe's amounts, and cached", async () => {
  const { createHandler: offersHandler } = await import("../api/offers.js");
  let lookups = 0;
  const deps = fakeDeps({
    async getPrice(id) {
      lookups++;
      if (id === "price_month") return { unit_amount: 499, currency: "usd", recurring: { interval: "month" } };
      throw Object.assign(new Error("No such price"), { code: "resource_missing" });
    },
  });
  deps.env = { STRIPE_PRICE_MONTHLY: "price_month", STRIPE_PRICE_PASS: "price_broken" };
  const h = offersHandler(deps);
  const body = await (await h(new Request("https://app.test/api/offers"))).json();
  assert.deepEqual(body.offers, [
    { id: "pass", amount: null, currency: null, interval: null },
    { id: "monthly", amount: 499, currency: "usd", interval: "month" },
  ]);
  await h(new Request("https://app.test/api/offers"));
  assert.equal(lookups, 2, "second call served from cache");
});

test("checkout: the monthly offer is a subscription carrying the uid", async () => {
  const deps = fakeDeps();
  deps.env.STRIPE_PRICE_MONTHLY = "price_month";
  const res = await checkoutHandler(deps)(post({ offer: "monthly" }, "free", "checkout"));
  assert.equal(res.status, 200);
  const p = deps.calls.checkouts[0];
  assert.equal(p.mode, "subscription");
  assert.deepEqual(p.line_items, [{ price: "price_month", quantity: 1 }]);
  assert.deepEqual(p.subscription_data, { metadata: { uid: "free" } });
  delete deps.env.STRIPE_PRICE_MONTHLY;
  assert.equal((await checkoutHandler(deps)(post({ offer: "monthly" }, "free", "checkout"))).status, 503);
});

test("prices are formatted from Stripe's minor units", async () => {
  const { fmtPrice } = await import("../src/format.js");
  assert.equal(fmtPrice(499, "usd", "month", "en-US"), "$4.99 / month");
  assert.equal(fmtPrice(3900, "eur", "year", "en-US"), "€39.00 / year");
  assert.equal(fmtPrice(500, "jpy", null, "en-US"), "¥500");
  assert.equal(fmtPrice(null, "usd"), "");
});

test("subscription events carry the plan length, renewal and cancellation dates", () => {
  const S = Math.floor(NOW / 1000);
  const sub = (over = {}) => ({
    type: "customer.subscription.updated",
    data: { object: { id: "sub_1", status: "active", customer: "cus_1", metadata: { uid: "u1" }, cancel_at_period_end: false, cancel_at: null, items: { data: [{ current_period_end: S + 30 * 86400, price: { recurring: { interval: "month" } } }] }, ...over } },
  });
  const renewing = patchForEvent(sub(), null, NOW);
  assert.equal(renewing.subscriptionInterval, "month");
  assert.equal(renewing.subscriptionRenewsAt, (S + 30 * 86400) * 1000);
  assert.equal(renewing.subscriptionEndsAt, null);
  assert.equal(renewing.stripeCustomerId, "cus_1");
  const cancelled = patchForEvent(sub({ cancel_at_period_end: true }), null, NOW);
  assert.equal(cancelled.subscriptionActive, true, "still paid up");
  assert.equal(cancelled.subscriptionEndsAt, (S + 30 * 86400) * 1000);
  // Older API versions put the period end on the subscription itself.
  const old = patchForEvent(sub({ items: { data: [{}] }, current_period_end: S + 99 }), null, NOW);
  assert.equal(old.subscriptionRenewsAt, (S + 99) * 1000);

  const me = publicPlan({ ...renewing, subscriptionActive: true }, NOW);
  assert.deepEqual([me.plan, me.interval, me.renewsAt, me.endsAt, me.billing], ["pro", "month", renewing.subscriptionRenewsAt, null, true]);
  const ending = publicPlan({ ...cancelled }, NOW);
  assert.equal(ending.renewsAt, null);
  assert.equal(ending.endsAt, cancelled.subscriptionEndsAt);
  assert.equal(publicPlan({ subscriptionActive: false, subscriptionRenewsAt: 5 }, NOW).renewsAt, null);
});

test("billing portal: opens for a Stripe customer and returns to the app", async () => {
  const { createHandler: portalHandler } = await import("../api/billing-portal.js");
  const portals = [];
  const deps = fakeDeps({ async createPortal(p) { portals.push(p); return { url: "https://billing.test/p" }; } });
  deps.users.u1.stripeCustomerId = "cus_1";
  const res = await portalHandler(deps)(post({}, "u1", "billing-portal"));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).url, "https://billing.test/p");
  assert.deepEqual(portals[0], { customer: "cus_1", return_url: "https://app.test/?billing=return" });
  assert.equal((await portalHandler(deps)(post({}, "free", "billing-portal"))).status, 409);
  assert.equal((await portalHandler(deps)(post({}, null, "billing-portal"))).status, 401);
});

test("checkout: a one-off pass creates a Stripe customer so receipts have a home", async () => {
  const deps = fakeDeps();
  await checkoutHandler(deps)(post({ offer: "pass" }, "free", "checkout"));
  assert.equal(deps.calls.checkouts[0].customer_creation, "always");
  deps.users.free.stripeCustomerId = "cus_9";
  await checkoutHandler(deps)(post({ offer: "pass" }, "free", "checkout"));
  assert.equal(deps.calls.checkouts[1].customer, "cus_9");
  assert.equal(deps.calls.checkouts[1].customer_creation, undefined);
});
