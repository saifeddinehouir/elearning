import { h } from "../dom.js";
import { signIn, signInWithEmail, createAccount, resetPassword, startAccounts, accountStatus } from "../account.js";
import { authErrorMessage, checkCredentials } from "../auth-errors.js";

const GOOGLE_G = `<svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`;

const POINTS = [
  ["Ten minutes a day", "Spaced repetition decides what to review, so what you learn stays learned."],
  ["Interview-ready decks", "Coding patterns, Java & Spring and DevOps, or build your own from notes and videos."],
  ["Ready by the day", "Set your interview date and every review is paced to land before it."],
];

let mode = "signin"; // "signin" | "create"; kept across re-renders

// The first screen when signed out: what the app is, then sign in or create
// an account (email and password, or Google, which also creates one).
export function renderSignIn({ loading = false } = {}) {
  const wrap = h("div", { class: "signin" });
  wrap.append(
    h("div", { class: "kicker" }, "DailyQCM"),
    h("h1", { class: "signin-title" }, "Learn it once. Remember it for good."),
    h(
      "ul",
      { class: "signin-points" },
      ...POINTS.map(([title, sub]) => h("li", {}, h("strong", {}, title), h("span", {}, sub)))
    )
  );

  const card = h("div", { class: "card signin-card" });
  wrap.appendChild(card);
  if (loading) {
    card.appendChild(h("p", { class: "small muted" }, "Loading…"));
    return wrap;
  }

  const message = h("p", { class: "signin-message", role: "status" });
  const say = (text, bad = false) => {
    message.textContent = text;
    message.classList.toggle("bad", bad);
  };

  if (accountStatus() === "unavailable") {
    const retry = h(
      "button",
      {
        class: "btn primary block lg",
        onclick: async () => {
          retry.disabled = true;
          say("Connecting…");
          await startAccounts();
          retry.disabled = false;
          if (accountStatus() === "unavailable") say("Still can't reach the sign-in service.", true);
        },
      },
      "Try again"
    );
    card.append(
      h("div", { class: "promo-title", style: "font-size:1.3rem" }, "You're offline"),
      h("p", { class: "small muted", style: "margin:6px 0 14px" }, "Signing in needs a connection the first time. Once you've signed in, the app also works offline."),
      retry,
      message
    );
    return wrap;
  }

  const creating = mode === "create";
  const tabs = h(
    "div",
    { class: "segmented signin-tabs" },
    ...[
      ["signin", "Sign in"],
      ["create", "Create account"],
    ].map(([val, label]) =>
      h("button", { type: "button", class: mode === val ? "active" : "", onclick: () => switchTo(val) }, label)
    )
  );

  const name = h("input", { type: "text", autocomplete: "name", placeholder: "Optional" });
  const email = h("input", { type: "email", autocomplete: "email", inputmode: "email", autocapitalize: "off", spellcheck: "false", required: true });
  const password = h("input", {
    type: "password",
    autocomplete: creating ? "new-password" : "current-password",
    required: true,
    minlength: creating ? 6 : undefined,
  });
  const showPw = h(
    "button",
    {
      type: "button",
      class: "signin-show",
      "aria-label": "Show password",
      onclick: () => {
        const hidden = password.type === "password";
        password.type = hidden ? "text" : "password";
        showPw.textContent = hidden ? "Hide" : "Show";
      },
    },
    "Show"
  );
  const submit = h("button", { type: "submit", class: "btn primary block lg" }, creating ? "Create account" : "Sign in");

  const form = h(
    "form",
    {
      novalidate: true,
      onsubmit: async (e) => {
        e.preventDefault();
        const problem = checkCredentials({ email: email.value, password: password.value, creating });
        if (problem) return say(problem, true);
        await busy(submit, creating ? "Creating your account…" : "Signing in…", () =>
          creating ? createAccount(email.value, password.value, name.value) : signInWithEmail(email.value, password.value)
        );
      },
    },
    creating ? h("label", { class: "field" }, h("span", {}, "Name"), name) : null,
    h("label", { class: "field" }, h("span", {}, "Email"), email),
    h("label", { class: "field" }, h("span", {}, creating ? "Password (6+ characters)" : "Password"), h("div", { class: "signin-pw" }, password, showPw)),
    submit
  );

  const forgot = creating
    ? null
    : h(
        "button",
        {
          type: "button",
          class: "btn subtle",
          onclick: async () => {
            if (!email.value.trim()) {
              email.focus();
              return say("Enter your email above, then tap Forgot password.", true);
            }
            await busy(forgot, "Sending a reset link…", () => resetPassword(email.value), `If an account exists for ${email.value.trim()}, a reset link is on its way.`);
          },
        },
        "Forgot password?"
      );

  const google = h(
    "button",
    { type: "button", class: "btn block lg signin-google", onclick: () => busy(google, "Opening Google sign-in…", () => signIn()) },
    h("span", { html: GOOGLE_G }),
    "Continue with Google"
  );

  // (Element.append would print a null as text, hence the filter.)
  card.append(
    ...[tabs, form, message, forgot].filter(Boolean),
    h("div", { class: "signin-or" }, h("span", {}, "or")),
    google,
    h(
      "p",
      { class: "list-footnote" },
      creating
        ? "Google also creates an account the first time you use it. Your decks and progress stay on this device."
        : "New here? Choose Create account, or continue with Google."
    )
  );

  function switchTo(val) {
    if (val === mode) return;
    mode = val;
    const keepEmail = email.value;
    const next = renderSignIn();
    wrap.replaceWith(next);
    const nextEmail = next.querySelector('input[type="email"]');
    if (nextEmail) nextEmail.value = keepEmail;
  }

  // Runs an auth step with the button disabled; success re-renders the app
  // through the account change, so only failures (and notes) are shown here.
  async function busy(button, pending, fn, done = "") {
    button.disabled = true;
    say(pending);
    try {
      await fn();
      say(done);
    } catch (err) {
      console.error(err);
      say(authErrorMessage(err), true);
    } finally {
      button.disabled = false;
    }
  }

  return wrap;
}
