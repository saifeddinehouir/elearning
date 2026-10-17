// GET /api/offers  (public)
// → 200 { offers: [{ id, amount, currency, interval }] } for every offer whose
// Stripe price id is set, so the app shows only what can be bought, at the
// price Stripe will charge.

import { route, json } from "./_lib/http.js";
import { realDeps } from "./_lib/services.js";
import { OFFERS, availableOffers, priceSummary } from "./_lib/entitlement.js";

const CACHE_MS = 10 * 60 * 1000;

export function createHandler(deps) {
  let cached = null;
  return route(["GET"], async () => {
    const now = deps.now();
    if (!cached || now - cached.at > CACHE_MS) {
      const offers = [];
      for (const id of availableOffers(deps.env)) {
        let summary = { amount: null, currency: null, interval: null };
        try {
          summary = priceSummary(await deps.getPrice(deps.env[OFFERS[id].priceEnv]));
        } catch (err) {
          console.error(`Price lookup failed for ${id}`, err?.code || err?.message);
        }
        offers.push({ id, ...summary });
      }
      cached = { at: now, offers };
    }
    return json(200, { offers: cached.offers });
  });
}

let handler = null;
export default {
  fetch(request) {
    handler ??= createHandler(realDeps());
    return handler(request);
  },
};
