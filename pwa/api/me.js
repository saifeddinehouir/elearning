// GET /api/me  Header: Authorization: Bearer <Firebase ID token>
// → 200 { plan, subscription, proUntil, videosThisMonth, videoLimit }

import { route, json, bearerToken } from "./_lib/http.js";
import { realDeps } from "./_lib/services.js";
import { publicPlan } from "./_lib/entitlement.js";

export function createHandler(deps) {
  return route(["GET"], async (request) => {
    const { uid } = await deps.verifyIdToken(bearerToken(request));
    return json(200, publicPlan(await deps.getUser(uid), deps.now()));
  });
}

let handler = null;
export default {
  fetch(request) {
    handler ??= createHandler(realDeps());
    return handler(request);
  },
};
