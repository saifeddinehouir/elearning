import { h } from "../dom.js";
import { signIn, startAccounts, accountStatus } from "../account.js";

// Full-screen gate shown before the app until someone signs in. With Google
// sign-in, the first sign-in creates the account, so one button covers both.
export function renderSignIn({ loading = false } = {}) {
  const wrap = h("div", { class: "signin" });
  const card = h("div", { class: "card hero welcome" });
  wrap.appendChild(card);
  card.append(
    h("div", { class: "kicker" }, "DailyQCM"),
    h("div", { class: "promo-title" }, "Learn it once. Remember it for good."),
    h("p", { class: "muted", style: "margin:10px 0 0;max-width:40ch" }, "Short daily sessions scheduled by spaced repetition, for course exams and coding interviews.")
  );

  if (loading) {
    card.appendChild(h("p", { class: "small muted mt" }, "Loading…"));
    return wrap;
  }

  const message = h("p", { class: "small", style: "margin:12px 0 0;min-height:1.2em" });
  const say = (text, bad = false) => {
    message.textContent = text;
    message.style.color = bad ? "var(--bad)" : "";
  };
  const unavailable = accountStatus() === "unavailable";

  const button = h(
    "button",
    {
      class: "btn primary block lg mt",
      onclick: async () => {
        button.disabled = true;
        say(unavailable ? "Connecting…" : "Opening Google sign-in…");
        try {
          if (unavailable) await startAccounts();
          else await signIn();
          // Success re-renders the app from the account change; if the popup
          // was closed, just let them try again.
          say("");
        } catch (err) {
          console.error(err);
          say(err?.message || "Couldn't sign in. Try again.", true);
        } finally {
          button.disabled = false;
        }
      },
    },
    unavailable ? "Try again" : "Continue with Google"
  );

  card.append(
    button,
    message,
    h(
      "p",
      { class: "list-footnote" },
      unavailable
        ? "Can't reach the sign-in service. Check your connection, then try again."
        : "New here? Continuing with Google creates your account. Your decks and progress stay on this device."
    )
  );
  return wrap;
}
