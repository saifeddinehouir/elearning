// The real services behind the handlers, built lazily from environment
// variables so importing a handler (e.g. in tests) loads no SDK. Each handler
// takes these as `deps`; tests pass fakes with the same shape.
//
// Environment (set in the Vercel project):
//   FIREBASE_SERVICE_ACCOUNT  service-account JSON (the downloaded key file)
//   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
//   STRIPE_PRICE_PASS, STRIPE_PRICE_YEARLY   Stripe price ids
//   APP_URL                   e.g. https://dailyqcm.vercel.app (checkout returns here)
//   ANTHROPIC_API_KEY
//   TRANSCRIPT_MCP_URL, TRANSCRIPT_MCP_TOKEN optional remote MCP server for transcripts
//   DECK_EFFORT               optional, default "high"

import { HttpError } from "./http.js";
import { createTokenVerifier } from "./firebase-token.js";

// Reads FIREBASE_SERVICE_ACCOUNT into the fields cert() needs, or names
// what's wrong with it. Pure; the messages never include the key itself.
export function parseServiceAccount(raw) {
  if (!raw || !String(raw).trim()) return { problem: "not_configured" };
  let sa;
  try {
    sa = JSON.parse(String(raw).trim());
  } catch {
    return { problem: "service_account_not_json" };
  }
  if (!sa || typeof sa !== "object") return { problem: "service_account_not_json" };
  if (sa.type !== "service_account") return { problem: "service_account_wrong_file" };
  if (!sa.project_id || !sa.client_email || !sa.private_key) return { problem: "service_account_incomplete" };
  // A key pasted through some editors arrives with literal "\n" pairs
  // instead of newlines; the PEM parser needs real ones.
  const privateKey = String(sa.private_key).includes("\\n") ? String(sa.private_key).replace(/\\n/g, "\n") : sa.private_key;
  return { account: { projectId: sa.project_id, clientEmail: sa.client_email, privateKey } };
}

const SETUP_PROBLEMS = {
  not_configured: "Accounts aren't set up on this server yet.",
  service_account_not_json: "FIREBASE_SERVICE_ACCOUNT isn't valid JSON. Paste the whole downloaded key file.",
  service_account_wrong_file: "FIREBASE_SERVICE_ACCOUNT isn't a service-account key (Project settings → Service accounts → Generate new private key).",
  service_account_incomplete: "FIREBASE_SERVICE_ACCOUNT is missing project_id, client_email or private_key.",
  service_account_rejected: "Firebase rejected FIREBASE_SERVICE_ACCOUNT's private key.",
};
const setupError = (code) => new HttpError(503, code, SETUP_PROBLEMS[code]);

// Sign-in tokens are checked with jose against Google's public keys (see
// firebase-token.js); only Firestore goes through firebase-admin.
let verifier = null;
function tokenVerifier() {
  if (verifier) return verifier;
  const { account, problem } = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT);
  if (problem) throw setupError(problem);
  verifier = createTokenVerifier(account.projectId);
  return verifier;
}

let firebase = null;
async function admin() {
  if (firebase) return firebase;
  const { account, problem } = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT);
  if (problem) throw setupError(problem);
  // Each step is named so a failure on the server says where it happened
  // (with the error's code, never its message) without needing the logs.
  let step = "load_sdk";
  try {
    const { initializeApp, getApps, cert } = await import("firebase-admin/app");
    const { getFirestore, FieldValue } = await import("firebase-admin/firestore");
    step = "credential";
    const app = getApps()[0] || initializeApp({ credential: cert(account) });
    step = "firestore";
    firebase = { db: getFirestore(app), FieldValue };
    return firebase;
  } catch (err) {
    console.error(`Firebase Admin failed at ${step}`, err);
    if (step === "credential") throw setupError("service_account_rejected");
    throw new HttpError(503, `firebase_${step}_failed`, `Firebase setup failed at ${step} (${err?.code || err?.name || "error"}).`);
  }
}

let stripeClient = null;
async function stripe() {
  if (stripeClient) return stripeClient;
  if (!process.env.STRIPE_SECRET_KEY) throw new HttpError(503, "not_configured", "Payments aren't set up on this server yet.");
  const { default: Stripe } = await import("stripe");
  stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  return stripeClient;
}

let anthropicClient = null;
async function anthropic() {
  if (anthropicClient) return anthropicClient;
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  anthropicClient = new Anthropic(); // reads ANTHROPIC_API_KEY
  return anthropicClient;
}

export function realDeps() {
  return {
    env: process.env,
    now: () => Date.now(),

    async verifyIdToken(token) {
      const verify = tokenVerifier();
      try {
        return await verify(token);
      } catch {
        throw new HttpError(401, "signed_out", "Your sign-in expired. Sign in again.");
      }
    },

    async getUser(uid) {
      const { db } = await admin();
      const snap = await db.collection("users").doc(uid).get();
      return snap.exists ? snap.data() : null;
    },

    async mergeUser(uid, patch) {
      const { db } = await admin();
      await db.collection("users").doc(uid).set({ ...patch, updatedAt: Date.now() }, { merge: true });
    },

    async addVideoUse(uid, month) {
      const { db, FieldValue } = await admin();
      await db.collection("users").doc(uid).set({ usage: { [month]: FieldValue.increment(1) } }, { merge: true });
    },

    // Applies a Stripe event at most once: Stripe retries deliveries, and a
    // pass bought twice by a retry would double its length.
    async applyStripeEventOnce(event, uid, patchFn) {
      const { db } = await admin();
      const seenRef = db.collection("stripeEvents").doc(event.id);
      const userRef = db.collection("users").doc(uid);
      return db.runTransaction(async (tx) => {
        const [seen, user] = await Promise.all([tx.get(seenRef), tx.get(userRef)]);
        if (seen.exists) return "duplicate";
        const patch = patchFn(user.exists ? user.data() : null);
        tx.create(seenRef, { type: event.type, uid, at: Date.now() });
        if (patch) tx.set(userRef, { ...patch, updatedAt: Date.now() }, { merge: true });
        return patch ? "applied" : "ignored";
      });
    },

    async getPrice(priceId) {
      return (await stripe()).prices.retrieve(priceId);
    },

    // Stripe's hosted billing page: cancel, change card, invoices.
    async createPortal(params) {
      const { default: Stripe } = await import("stripe");
      try {
        return await (await stripe()).billingPortal.sessions.create(params);
      } catch (err) {
        if (err instanceof Stripe.errors.StripeInvalidRequestError) {
          console.error("Billing portal unavailable", err.message);
          throw new HttpError(503, "portal_not_configured", "The billing page isn't set up yet. Try again later.");
        }
        throw err;
      }
    },

    async createCheckout(params) {
      return (await stripe()).checkout.sessions.create(params);
    },

    async constructStripeEvent(rawBody, signature) {
      const secret = process.env.STRIPE_WEBHOOK_SECRET;
      if (!secret) throw new HttpError(503, "not_configured", "Webhook secret missing.");
      try {
        return (await stripe()).webhooks.constructEvent(rawBody, signature, secret);
      } catch {
        throw new HttpError(400, "bad_signature", "Webhook signature didn't verify.");
      }
    },

    // Streams (long transcripts and decks can take a while) and returns the
    // final message. API failures become responses the app can explain.
    async createMessage(params) {
      const client = await anthropic();
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      try {
        return await client.beta.messages.stream(params).finalMessage();
      } catch (err) {
        // Most specific first; the SDK already retried 429/5xx/connection errors.
        if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError || err instanceof Anthropic.APIConnectionError) {
          throw new HttpError(503, "busy", "The deck generator is busy. Try again in a minute.");
        }
        if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
          console.error("Anthropic credentials rejected", err.status);
          throw new HttpError(503, "not_configured", "Deck generation isn't set up on this server yet.");
        }
        if (err instanceof Anthropic.BadRequestError) {
          console.error("Anthropic rejected the request", err.message);
          throw new HttpError(502, "generation_failed", "Couldn't build a deck from this video.");
        }
        throw err;
      }
    },
  };
}
