// Deployment settings for accounts and payments. Everything here is public:
// a Firebase web config identifies the project, it isn't a secret (access is
// enforced by Firebase Auth and the server). Secrets live in the Vercel
// project's environment variables, never in this file.
//
// While FIREBASE_CONFIG is null the app runs exactly as before: no sign-in,
// no checkout, no video import.

// From Firebase console → Project settings → Your apps → Web app. Analytics
// isn't loaded, so its measurementId is left out.
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDXoh0Glpr4-1iftGby2Zfui0yq4Q1uDnw",
  authDomain: "dailyqcm.firebaseapp.com",
  projectId: "dailyqcm",
  storageBucket: "dailyqcm.firebasestorage.app",
  messagingSenderId: "149091227880",
  appId: "1:149091227880:web:d21b6f6d76bfb3e38fd15d",
};

// Where the /api functions live. Empty = same origin (the app and the API are
// both deployed on Vercel).
export const API_BASE = "";

// Wording for each offer on the upgrade sheet. Which offers appear, and their
// prices, come from the server (/api/offers): only those with a Stripe price
// id set in Vercel are shown.
export const OFFERS = [
  { id: "monthly", title: "Pro, monthly", sub: "Renews every month. Cancel anytime." },
  { id: "yearly", title: "Pro, yearly", sub: "Renews every year until you cancel." },
  { id: "pass", title: "Interview pass", sub: "3 months of Pro, paid once. Buying another adds 3 more." },
];
