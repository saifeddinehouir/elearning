// POST /api/billing-portal  Header: Authorization: Bearer <Firebase ID token>
// → 200 { url } of Stripe's customer portal, where the user can cancel,
// change their card and download invoices. It returns to the app after.

import { route, json, bearerToken, HttpError } from "./_lib/http.js";
import { realDeps } from "./_lib/services.js";

export function createHandler(deps) {
  return route(["POST"], async (request) => {
    const { uid } = await deps.verifyIdToken(bearerToken(request));
    const appUrl = deps.env.APP_URL;
    if (!appUrl) throw new HttpError(503, "not_configured", "Payments aren't set up on this server yet.");
    const user = await deps.getUser(uid);
    if (!user?.stripeCustomerId) throw new HttpError(409, "no_billing", "There's no billing to manage yet.");
    const session = await deps.createPortal({ customer: user.stripeCustomerId, return_url: `${appUrl}/?billing=return` });
    return json(200, { url: session.url });
  });
}

let handler = null;
export default {
  fetch(request) {
    handler ??= createHandler(realDeps());
    return handler(request);
  },
};
