// Deployment settings for accounts and payments. Everything here is public:
// a Firebase web config identifies the project, it isn't a secret (access is
// enforced by Firebase Auth and the server). Secrets live in the Vercel
// project's environment variables, never in this file.
//
// While FIREBASE_CONFIG is null the app runs exactly as before: no sign-in,
// no checkout, no video import.

export const FIREBASE_CONFIG = null;
// Example, from Firebase console → Project settings → Your apps → Web app:
// export const FIREBASE_CONFIG = {
//   apiKey: "AIza...",
//   authDomain: "your-project.firebaseapp.com",
//   projectId: "your-project",
//   appId: "1:123:web:abc",
// };

// Where the /api functions live. Empty = same origin (the app and the API are
// both deployed on Vercel).
export const API_BASE = "";

// Shown on the upgrade sheet. Leave a price null to show the offer without one.
export const OFFERS = [
  { id: "pass", title: "Interview pass", sub: "3 months of Pro, paid once. Buying another adds 3 more.", price: null },
  { id: "yearly", title: "Pro, yearly", sub: "Renews every year until you cancel.", price: null },
];
