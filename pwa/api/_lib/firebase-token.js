// Verifies Firebase Auth ID tokens with `jose`, following Firebase's
// "verify ID tokens using a third-party JWT library" rules. Used instead of
// firebase-admin/auth, whose jwks-rsa dependency require()s the ESM-only
// jose and fails to load on Vercel's runtime (ERR_REQUIRE_ESM). jose is
// imported on first use so loading a handler needs no packages.

// Google's public keys for Firebase ID tokens.
export const FIREBASE_JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

// `keys` is a jose key set; tests pass a local one, the server fetches
// (and caches) Google's.
export function createTokenVerifier(projectId, keys = null) {
  return async function verify(token, now = Date.now()) {
    const { jwtVerify, createRemoteJWKSet } = await import("jose");
    keys ??= createRemoteJWKSet(new URL(FIREBASE_JWKS_URL));
    const { payload } = await jwtVerify(token, keys, {
      algorithms: ["RS256"],
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
      currentDate: new Date(now),
    });
    // sub is the user's uid; auth_time must not be in the future.
    if (typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 128) throw new Error("bad sub");
    if (typeof payload.auth_time !== "number" || payload.auth_time * 1000 > now + 60_000) throw new Error("bad auth_time");
    return { uid: payload.sub, email: typeof payload.email === "string" ? payload.email : null };
  };
}
