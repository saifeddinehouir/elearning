// Whether the app opens or shows the sign-in screen. Pure.
//
//   configured    accounts are set up in config.js (if not, the app is open)
//   status        "loading" | "signed_in" | "signed_out" | "unavailable"
//                 ("unavailable": Firebase couldn't load, e.g. offline)
//   knownAccount  someone signed in on this device before and hasn't signed out
//
// Being offline never locks out someone who already signed in here: their
// decks live on the device, so a study app has to open without a network.
export function gateFor({ configured, status, knownAccount }) {
  if (!configured || status === "signed_in") return "open";
  if (status === "unavailable") return knownAccount ? "open" : "signin";
  if (status === "loading") return knownAccount ? "open" : "loading";
  return "signin";
}
