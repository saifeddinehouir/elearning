// POST /api/stripe-webhook  (called by Stripe, not the app)
// Verifies the signature on the raw body, then updates users/{uid} once per
// event. Subscribe the endpoint to: checkout.session.completed,
// customer.subscription.created, customer.subscription.updated,
// customer.subscription.deleted.

import { route, json, HttpError } from "./_lib/http.js";
import { realDeps } from "./_lib/services.js";
import { uidOfEvent, patchForEvent } from "./_lib/entitlement.js";

export function createHandler(deps) {
  return route(["POST"], async (request) => {
    const signature = request.headers.get("stripe-signature");
    if (!signature) throw new HttpError(400, "bad_signature", "Missing Stripe signature.");
    const event = await deps.constructStripeEvent(await request.text(), signature);

    const uid = uidOfEvent(event);
    // Events we don't track, or without our metadata, are acknowledged so
    // Stripe doesn't keep retrying them.
    if (!uid) return json(200, { received: true, result: "ignored" });
    const now = deps.now();
    const result = await deps.applyStripeEventOnce(event, uid, (user) => patchForEvent(event, user, now));
    return json(200, { received: true, result });
  });
}

let handler = null;
export default {
  fetch(request) {
    handler ??= createHandler(realDeps());
    return handler(request);
  },
};
