// Sign-in (Firebase Auth, Google provider) and calls to the /api functions.
// Firebase is loaded from Google's CDN only when FIREBASE_CONFIG is set, so
// the app still has no build step and no dependency when accounts are off.
// Browser-only.

import { FIREBASE_CONFIG, API_BASE } from "./config.js";
import { setEntitlement } from "./store.js";

const FIREBASE = "https://www.gstatic.com/firebasejs/13.0.0/";

export const accountsConfigured = () => !!FIREBASE_CONFIG;

// Firebase comes from the network; offline it can't load, so give up after a
// while instead of leaving the app on a spinner.
const LOAD_TIMEOUT_MS = 8000;

let firebasePromise = null;
function firebase() {
  firebasePromise ??= (async () => {
    const load = (async () => {
      const { initializeApp } = await import(`${FIREBASE}firebase-app.js`);
      const fa = await import(`${FIREBASE}firebase-auth.js`);
      return { fa, auth: fa.getAuth(initializeApp(FIREBASE_CONFIG)) };
    })();
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("Sign-in service didn't load")), LOAD_TIMEOUT_MS));
    return Promise.race([load, timeout]);
  })().catch((err) => {
    firebasePromise = null; // let a later attempt retry
    throw err;
  });
  return firebasePromise;
}

let user = null;
let status = "loading"; // "loading" | "signed_in" | "signed_out" | "unavailable"
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

// Who last signed in on this device, kept until they sign out, so the app
// opens offline for them (see gate.js).
const KNOWN_KEY = "dailyqcm.account";
export function knownAccount() {
  try {
    return JSON.parse(localStorage.getItem(KNOWN_KEY) || "null");
  } catch {
    return null;
  }
}
function rememberAccount(u) {
  try {
    if (u) localStorage.setItem(KNOWN_KEY, JSON.stringify({ uid: u.uid, email: u.email || null, name: u.displayName || null }));
    else localStorage.removeItem(KNOWN_KEY);
  } catch {}
}

// The signed-in user as { email, name }, or null. Offline, the remembered
// account stands in until Firebase can confirm it.
export function currentUser() {
  if (user) {
    return {
      email: user.email,
      name: user.displayName,
      // "google.com" or "password" (email and password)
      provider: user.providerData?.[0]?.providerId || null,
      verified: !!user.emailVerified,
    };
  }
  const known = status === "signed_out" ? null : knownAccount();
  return known ? { email: known.email, name: known.name || null, offline: true } : null;
}
export const accountStatus = () => status;
export const accountReady = () => status !== "loading";
export function onAccountChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Call once on start (and again to retry after "unavailable"). Finishes a
// redirect sign-in if one is pending, then follows sign-in changes; the plan
// is refreshed in the background so opening the app never waits on /api.
let listening = false;
export async function startAccounts() {
  if (!accountsConfigured()) return;
  let fb;
  try {
    fb = await firebase();
  } catch (err) {
    console.error(err);
    status = "unavailable";
    notify();
    return;
  }
  const { fa, auth } = fb;
  try {
    await fa.getRedirectResult(auth);
  } catch (err) {
    console.error("Sign-in redirect failed", err);
  }
  if (listening) return;
  listening = true;
  fa.onAuthStateChanged(auth, (u) => {
    user = u;
    status = u ? "signed_in" : "signed_out";
    rememberAccount(u);
    if (u) refreshEntitlement().catch((err) => console.error(err));
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

export async function signInWithEmail(email, password) {
  const { fa, auth } = await firebase();
  await fa.signInWithEmailAndPassword(auth, email.trim(), password);
}

// New account; the name (optional) shows in Settings, and a verification
// email goes out without holding up sign-in.
export async function createAccount(email, password, name = "") {
  const { fa, auth } = await firebase();
  const { user: u } = await fa.createUserWithEmailAndPassword(auth, email.trim(), password);
  if (name.trim()) {
    await fa.updateProfile(u, { displayName: name.trim() }).catch(() => {});
    // The sign-in event already fired without the name; show it now.
    rememberAccount(u);
    notify();
  }
  fa.sendEmailVerification(u).catch((err) => console.error(err));
}

// Sets the name the app greets you by (and shows in Settings).
export async function updateName(name) {
  if (!user) throw new ApiError(401, "signed_out", "Sign in first.");
  const { fa } = await firebase();
  await fa.updateProfile(user, { displayName: name.trim() || null });
  rememberAccount(user);
  notify();
}

export async function resendVerification() {
  if (!user) throw new ApiError(401, "signed_out", "Sign in first.");
  const { fa } = await firebase();
  await fa.sendEmailVerification(user);
}

export async function resetPassword(email) {
  const { fa, auth } = await firebase();
  await fa.sendPasswordResetEmail(auth, email.trim());
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

// The offers the server can sell right now, with Stripe prices. Public: no
// sign-in needed. [] when payments aren't set up or the server can't be reached.
export async function fetchOffers() {
  try {
    const res = await fetch(`${API_BASE}/api/offers`);
    if (!res.ok) return [];
    return (await res.json()).offers || [];
  } catch {
    return [];
  }
}

export async function refreshEntitlement() {
  const me = await api("me");
  setEntitlement({ ...me, checkedAt: Date.now() });
  return me;
}

// Sends the browser to Stripe Checkout for "monthly", "yearly" or "pass".
export async function startCheckout(offer) {
  const { url } = await api("checkout", { method: "POST", body: { offer } });
  location.href = url;
}

// Sends the browser to Stripe's billing page (cancel, card, invoices).
export async function openBillingPortal() {
  const { url } = await api("billing-portal", { method: "POST" });
  location.href = url;
}

export const deckFromVideo = ({ url, transcript, deckName }) =>
  api("youtube-deck", { method: "POST", body: { url, transcript, deckName } });
