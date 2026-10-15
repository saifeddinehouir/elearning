// The real services behind the handlers, built lazily from environment
// variables so importing a handler (e.g. in tests) loads no SDK. Each handler
// takes these as `deps`; tests pass fakes with the same shape.
//
// Environment (set in the Vercel project):
//   FIREBASE_SERVICE_ACCOUNT  service-account JSON (one line)
//   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
//   STRIPE_PRICE_PASS, STRIPE_PRICE_YEARLY   Stripe price ids
//   APP_URL                   e.g. https://dailyqcm.vercel.app (checkout returns here)
//   ANTHROPIC_API_KEY
//   TRANSCRIPT_MCP_URL, TRANSCRIPT_MCP_TOKEN optional remote MCP server for transcripts
//   DECK_EFFORT               optional, default "high"

import { HttpError } from "./http.js";

let firebase = null;
async function admin() {
  if (firebase) return firebase;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new HttpError(503, "not_configured", "Accounts aren't set up on this server yet.");
  const { initializeApp, getApps, cert } = await import("firebase-admin/app");
  const { getAuth } = await import("firebase-admin/auth");
  const { getFirestore, FieldValue } = await import("firebase-admin/firestore");
  const app = getApps()[0] || initializeApp({ credential: cert(JSON.parse(raw)) });
  firebase = { auth: getAuth(app), db: getFirestore(app), FieldValue };
  return firebase;
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
      const { auth } = await admin();
      try {
        const t = await auth.verifyIdToken(token);
        return { uid: t.uid, email: t.email || null };
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
