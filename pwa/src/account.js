// Sign-in (Firebase Auth, Google provider) and calls to the /api functions.
// Firebase is loaded from Google's CDN only when FIREBASE_CONFIG is set, so
// the app still has no build step and no dependency when accounts are off.
// Browser-only.

import { FIREBASE_CONFIG, API_BASE } from "./config.js";
import { setEntitlement } from "./store.js";

const FIREBASE = "https://www.gstatic.com/firebasejs/13.0.0/";

export const accountsConfigured = () => !!FIREBASE_CONFIG;

let firebasePromise = null;
function firebase() {
  firebasePromise ??= (async () => {
    const { initializeApp } = await import(`${FIREBASE}firebase-app.js`);
    const fa = await import(`${FIREBASE}firebase-auth.js`);
    return { fa, auth: fa.getAuth(initializeApp(FIREBASE_CONFIG)) };
  })();
  return firebasePromise;
}

let user = null;
let ready = false;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

// The signed-in user as { email, name }, or null.
export const currentUser = () => (user ? { email: user.email, name: user.displayName } : null);
export const accountReady = () => ready;
export function onAccountChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Call once on start. Finishes a redirect sign-in if one is pending, then
// keeps the cached plan in step with whoever is signed in.
export async function startAccounts() {
  if (!accountsConfigured()) return;
  const { fa, auth } = await firebase();
  try {
    await fa.getRedirectResult(auth);
  } catch (err) {
    console.error("Sign-in redirect failed", err);
  }
  fa.onAuthStateChanged(auth, async (u) => {
    user = u;
    ready = true;
    if (u) await refreshEntitlement().catch((err) => console.error(err));
    else setEntitlement(null);
    notify();
  });
}

// Popup first; a Home Screen app or a strict browser that blocks popups falls
// back to a full-page redirect.
export async function signIn() {
  const { fa, auth } = await firebase();
  const provider = new fa.GoogleAuthProvider();
  try {
    await fa.signInWithPopup(auth, provider);
  } catch (err) {
    if (err?.code === "auth/popup-blocked" || err?.code === "auth/operation-not-supported-in-this-environment") {
      await fa.signInWithRedirect(auth, provider);
      return;
    }
    if (err?.code === "auth/popup-closed-by-user" || err?.code === "auth/cancelled-popup-request") return;
    throw err;
  }
}

export async function signOut() {
  const { fa, auth } = await firebase();
  await fa.signOut(auth);
}

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

async function api(path, { method = "GET", body } = {}) {
  if (!user) throw new ApiError(401, "signed_out", "Sign in first.");
  const token = await user.getIdToken();
  let res;
  try {
    res = await fetch(`${API_BASE}/api/${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "offline", "You're offline. Try again when you're connected.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || "server_error", data.message || "Something went wrong.");
  return data;
}

export async function refreshEntitlement() {
  const me = await api("me");
  setEntitlement({ ...me, checkedAt: Date.now() });
  return me;
}

// Sends the browser to Stripe Checkout for "pass" or "yearly".
export async function startCheckout(offer) {
  const { url } = await api("checkout", { method: "POST", body: { offer } });
  location.href = url;
}

export const deckFromVideo = ({ url, transcript, deckName }) =>
  api("youtube-deck", { method: "POST", body: { url, transcript, deckName } });
