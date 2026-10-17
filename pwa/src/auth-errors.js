// Firebase Auth error codes → what to tell the person. Pure.

const MESSAGES = {
  "auth/invalid-credential": "Wrong email or password.",
  "auth/wrong-password": "Wrong email or password.",
  "auth/user-not-found": "No account with this email. Create one instead.",
  "auth/invalid-email": "That email address doesn't look right.",
  "auth/missing-email": "Enter your email first.",
  "auth/missing-password": "Enter your password.",
  "auth/email-already-in-use": "There's already an account with this email. Sign in instead.",
  "auth/weak-password": "Use a password of at least 6 characters.",
  "auth/too-many-requests": "Too many attempts. Wait a few minutes and try again.",
  "auth/network-request-failed": "No connection. Check your internet and try again.",
  "auth/user-disabled": "This account has been disabled.",
  "auth/operation-not-allowed": "This sign-in method isn't turned on yet.",
  "auth/popup-blocked": "The sign-in window was blocked. Allow pop-ups and try again.",
  "auth/unauthorized-domain": "Sign-in isn't allowed on this address yet.",
};

export const authErrorMessage = (err) =>
  MESSAGES[err?.code] || (err?.code ? "Couldn't sign in. Try again." : err?.message || "Couldn't sign in. Try again.");

// Light checks before a request, so typos get an instant answer.
export function checkCredentials({ email, password, creating = false }) {
  const e = String(email || "").trim();
  if (!e) return "Enter your email.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return "That email address doesn't look right.";
  if (!password) return "Enter your password.";
  if (creating && password.length < 6) return "Use a password of at least 6 characters.";
  return null;
}
