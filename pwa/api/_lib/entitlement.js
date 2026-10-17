// Who has Pro, and how Stripe events change that. Pure.
//
// users/{uid} in Firestore (written only by the server):
//   subscriptionActive  true while a subscription (monthly or yearly) is active, trialing
//                       or retrying a failed renewal (past_due)
//   subscriptionId, subscriptionStatus, stripeCustomerId
//   proUntil            ms; end of a one-off interview pass (null if none)
//   usage               { "YYYY-MM": videos turned into decks that month }

export const PASS_DAYS = 90;
export const MONTHLY_VIDEO_LIMIT = 30;
const DAY = 86400000;

// Each offer is live when its price id is set in the environment.
export const OFFERS = {
  pass: { mode: "payment", priceEnv: "STRIPE_PRICE_PASS" },
  monthly: { mode: "subscription", priceEnv: "STRIPE_PRICE_MONTHLY" },
  yearly: { mode: "subscription", priceEnv: "STRIPE_PRICE_YEARLY" },
};

export const availableOffers = (env) => Object.keys(OFFERS).filter((id) => !!env[OFFERS[id].priceEnv]);

// What the app shows for a Stripe price: { amount (minor units), currency,
// interval: "month" | "year" | null }.
export const priceSummary = (price) => ({
  amount: Number.isFinite(price?.unit_amount) ? price.unit_amount : null,
  currency: price?.currency || null,
  interval: price?.recurring?.interval || null,
});

export function isProEntitled(user, now = Date.now()) {
  if (!user) return false;
  return user.subscriptionActive === true || (Number.isFinite(user.proUntil) && user.proUntil > now);
}

// What the app is told about the signed-in user.
export function publicPlan(user, now = Date.now()) {
  const pro = isProEntitled(user, now);
  return {
    plan: pro ? "pro" : "free",
    subscription: user?.subscriptionActive === true,
    proUntil: Number.isFinite(user?.proUntil) ? user.proUntil : null,
    videosThisMonth: videosUsed(user, now),
    videoLimit: MONTHLY_VIDEO_LIMIT,
  };
}

export const monthKey = (now = Date.now()) => new Date(now).toISOString().slice(0, 7);
export const videosUsed = (user, now = Date.now()) => Number(user?.usage?.[monthKey(now)]) || 0;

// past_due keeps Pro while Stripe retries a failed renewal; it moves to
// canceled or unpaid if the retries run out.
const ACTIVE = new Set(["active", "trialing", "past_due"]);

// The uid a Stripe event is about, from the metadata set at checkout.
export function uidOfEvent(event) {
  const o = event?.data?.object || {};
  return o.client_reference_id || o.metadata?.uid || null;
}

// The users/{uid} fields to merge for a Stripe event, or null to ignore it.
// `user` is the current document (or null). A pass bought while one is still
// running extends it rather than restarting the clock.
export function patchForEvent(event, user, now = Date.now()) {
  const o = event?.data?.object || {};
  switch (event?.type) {
    case "checkout.session.completed": {
      if (o.payment_status && o.payment_status !== "paid" && o.payment_status !== "no_payment_required") return null;
      const base = { stripeCustomerId: o.customer || user?.stripeCustomerId || null };
      if (o.mode === "payment") {
        const from = Math.max(now, Number.isFinite(user?.proUntil) ? user.proUntil : 0);
        return { ...base, proUntil: from + PASS_DAYS * DAY };
      }
      if (o.mode === "subscription") {
        return { ...base, subscriptionActive: true, subscriptionId: o.subscription || null, subscriptionStatus: "active" };
      }
      return null;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const status = event.type === "customer.subscription.deleted" ? "canceled" : o.status;
      return { subscriptionActive: ACTIVE.has(status), subscriptionId: o.id || null, subscriptionStatus: status || null };
    }
    default:
      return null;
  }
}
