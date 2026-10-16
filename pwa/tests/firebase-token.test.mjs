// Firebase ID token checks, with a locally generated key standing in for
// Google's. Needs `npm install` (jose).
import { test } from "node:test";
import assert from "node:assert/strict";
import { SignJWT, generateKeyPair, exportJWK, createLocalJWKSet } from "jose";
import { createTokenVerifier } from "../api/_lib/firebase-token.js";

const PROJECT = "dailyqcm";
const NOW = Date.UTC(2026, 9, 17, 12);
const sec = (ms) => Math.floor(ms / 1000);

const { privateKey, publicKey } = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256" };
const verify = createTokenVerifier(PROJECT, createLocalJWKSet({ keys: [jwk] }));

const token = ({ iss = `https://securetoken.google.com/${PROJECT}`, aud = PROJECT, sub = "uid123", iat = sec(NOW) - 60, exp = sec(NOW) + 3000, auth_time = sec(NOW) - 120, key = privateKey, kid = "k1" } = {}) =>
  new SignJWT({ email: "a@b.test", auth_time })
    .setProtectedHeader({ alg: "RS256", kid })
    .setIssuer(iss)
    .setAudience(aud)
    .setSubject(sub)
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .sign(key);

test("a valid Firebase ID token gives the uid and email", async () => {
  assert.deepEqual(await verify(await token(), NOW), { uid: "uid123", email: "a@b.test" });
});

test("tokens for another project, expired, unsigned by Google or without a user are rejected", async () => {
  const other = await generateKeyPair("RS256");
  const bad = [
    await token({ aud: "someone-else" }),
    await token({ iss: "https://securetoken.google.com/someone-else" }),
    await token({ exp: sec(NOW) - 10, iat: sec(NOW) - 4000 }),
    await token({ key: other.privateKey }),
    await token({ sub: "" }),
    await token({ auth_time: sec(NOW) + 3600 }),
    "not-a-jwt",
  ];
  for (const t of bad) await assert.rejects(verify(t, NOW));
});
