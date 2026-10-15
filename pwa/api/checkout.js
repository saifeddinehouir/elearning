// POST /api/checkout  Body: { offer: "pass" | "yearly" }
// Header: Authorization: Bearer <Firebase ID token>
// → 200 { url } of a Stripe Checkout page. The webhook grants Pro once paid.

import { route, json, bearerToken, readJson, HttpError } from "./_lib/http.js";
import { realDeps } from "./_lib/services.js";
import { OFFERS, isProEntitled } from "./_lib/entitlement.js";

export function createHandler(deps) {
  return route(["POST"], async (request) => {
    const { uid, email } = await deps.verifyIdToken(bearerToken(request));
    const { offer } = await readJson(request);
    const def = OFFERS[offer];
    if (!def) throw new HttpError(400, "bad_offer", "Unknown offer.");
    const price = deps.env[def.priceEnv];
    const appUrl = deps.env.APP_URL;
    if (!price || !appUrl) throw new HttpError(503, "not_configured", "Payments aren't set up on this server yet.");

    const user = await deps.getUser(uid);
    if (def.mode === "subscription" && user?.subscriptionActive) {
      throw new HttpError(409, "already_subscribed", "You already have the yearly plan.");
    }

    const params = {
      mode: def.mode,
      line_items: [{ price, quantity: 1 }],
      client_reference_id: uid,
      metadata: { uid, offer },
      success_url: `${appUrl}/?checkout=success`,
      cancel_url: `${appUrl}/?checkout=cancel`,
      allow_promotion_codes: true,
    };
    if (user?.stripeCustomerId) params.customer = user.stripeCustomerId;
    else if (email) params.customer_email = email;
    // The subscription carries the uid so later renewals and cancellations
    // find the right account.
    if (def.mode === "subscription") params.subscription_data = { metadata: { uid } };

    const session = await deps.createCheckout(params);
    return json(200, { url: session.url, alreadyPro: isProEntitled(user, deps.now()) });
  });
}

let handler = null;
export default {
  fetch(request) {
    handler ??= createHandler(realDeps());
    return handler(request);
  },
};
