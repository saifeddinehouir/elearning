import { h, openOverlay, toast, ICONS } from "../dom.js";
import { getEntitlement } from "../store.js";
import {
  currentUser,
  onAccountChange,
  refreshEntitlement,
  updateName,
  resetPassword,
  resendVerification,
  signOut,
  openBillingPortal,
  startCheckout,
} from "../account.js";
import { fmtDateLong, firstName, initials } from "../format.js";
import { openPaywall } from "./paywall.js";

const PROVIDERS = { "google.com": "Google", password: "Email and password" };
const INTERVALS = { month: "Monthly", year: "Yearly" };

// Profile, plan and billing for the signed-in account.
export function openAccount() {
  openOverlay((close) => {
    const overlay = h("div", { class: "overlay" });
    const head = h("div", { class: "o-head" });
    const body = h("div", { class: "o-body" });
    overlay.append(head, body);
    head.append(h("button", { class: "btn", onclick: close }, "Done"), h("strong", {}, "Account"), h("div", { class: "spacer" }));

    const paint = () => {
      const u = currentUser();
      if (!u) return close(); // signed out meanwhile; the sign-in screen takes over
      body.replaceChildren(profile(u), planCard(getEntitlement(), u), details(u), signOutButton());
    };
    paint();
    // Fresh plan details (renewal date, usage) each time the page opens.
    refreshEntitlement().then(() => overlay.isConnected && paint()).catch(() => {});
    const off = onAccountChange(() => (overlay.isConnected ? paint() : off()));
    return overlay;
  });
}

function profile(u) {
  return h(
    "div",
    { class: "account-head" },
    h("div", { class: "avatar lg", "aria-hidden": "true" }, initials(u.name, u.email)),
    h(
      "div",
      { class: "spacer" },
      h("div", { class: "promo-title", style: "margin:0" }, u.name || "Your account"),
      h("div", { class: "small muted" }, u.email || ""),
      u.offline ? h("div", { class: "small", style: "color:var(--orange);margin-top:4px" }, "Offline: changes need a connection.") : null
    )
  );
}

function planCard(ent, u) {
  const card = h("div", { class: `card${ent?.plan === "pro" ? " pro" : ""}` });
  const line = (text, style = "") => h("p", { class: "small muted", style: `margin:4px 0 0;${style}` }, text);

  if (ent?.plan !== "pro") {
    card.append(
      h("div", { class: "kicker" }, "Your plan"),
      h("div", { class: "promo-title" }, "Free"),
      line("Daily sessions, streaks, stats and your own decks. Pro adds every library and path, interview date mode and decks from videos."),
      h("button", { class: "btn primary block mt", onclick: () => openPaywall() }, "Upgrade to Pro")
    );
    if (ent?.billing) card.appendChild(billingButton("Billing history"));
    return card;
  }

  card.appendChild(h("div", { class: "kicker" }, "Your plan"));
  if (ent.subscription) {
    card.appendChild(h("div", { class: "promo-title" }, `Pro${ent.interval ? ` · ${INTERVALS[ent.interval] || ent.interval}` : ""}`));
    if (ent.endsAt) {
      card.appendChild(line(`Cancelled. You keep Pro until ${fmtDateLong(ent.endsAt)}, and it won't renew.`, "color:var(--orange)"));
    } else if (ent.renewsAt) {
      card.appendChild(line(`Renews on ${fmtDateLong(ent.renewsAt)}.`));
    }
  } else {
    card.append(
      h("div", { class: "promo-title" }, "Pro · Interview pass"),
      line(ent.proUntil ? `Pro until ${fmtDateLong(ent.proUntil)}.` : "Active.")
    );
  }
  if (Number.isFinite(ent.videoLimit)) {
    card.appendChild(line(`Video decks this month: ${ent.videosThisMonth || 0} of ${ent.videoLimit}.`));
  }

  const actions = h("div", { class: "row", style: "gap:10px;margin-top:14px;flex-wrap:wrap" });
  if (ent.billing) actions.appendChild(billingButton(ent.subscription ? "Manage subscription" : "Receipts and billing"));
  if (!ent.subscription && !u.offline) {
    const extend = h(
      "button",
      {
        class: "btn",
        onclick: async () => {
          extend.disabled = true;
          try {
            await startCheckout("pass");
          } catch (err) {
            toast(err.message || "Couldn't open checkout", 3000);
            extend.disabled = false;
          }
        },
      },
      "Add 3 more months"
    );
    actions.appendChild(extend);
  }
  if (actions.childElementCount) card.appendChild(actions);
  if (ent.subscription && ent.billing) {
    card.appendChild(h("p", { class: "list-footnote" }, "Cancel, change your card or download invoices on Stripe's secure billing page."));
  }
  return card;
}

function billingButton(label) {
  const btn = h(
    "button",
    {
      class: "btn",
      onclick: async () => {
        btn.disabled = true;
        try {
          await openBillingPortal();
        } catch (err) {
          toast(err.message || "Couldn't open the billing page", 3500);
          btn.disabled = false;
        }
      },
    },
    label
  );
  return btn;
}

function details(u) {
  const list = h("div", { class: "list" });

  const nameInput = h("input", {
    type: "text",
    value: u.name || "",
    placeholder: "Add your name",
    autocomplete: "name",
    disabled: !!u.offline,
    class: "row-input",
    onchange: async (e) => {
      const value = e.target.value.trim();
      if (value === (u.name || "")) return;
      try {
        await updateName(value);
        toast(value ? `Hi, ${firstName(value)}!` : "Name removed");
      } catch (err) {
        toast(err.message || "Couldn't save your name", 3000);
      }
    },
  });
  list.appendChild(h("label", { class: "list-row inset" }, h("span", { class: "icon-chip c-purple", html: ICONS.pencil }), h("span", { class: "label" }, "Name"), nameInput));

  const emailing = u.provider === "password";
  const verify = emailing && !u.verified && !u.offline
    ? h(
        "button",
        {
          class: "btn",
          style: "padding:6px 10px",
          onclick: async () => {
            try {
              await resendVerification();
              toast(`Verification link sent to ${u.email}`, 3500);
            } catch (err) {
              toast(err.message || "Couldn't send it. Try again later.", 3000);
            }
          },
        },
        "Verify"
      )
    : null;
  list.appendChild(
    h(
      "div",
      { class: "list-row inset" },
      h("span", { class: "icon-chip", html: ICONS.mail }),
      h("span", { class: "label" }, "Email", h("span", { class: "sub" }, u.email || "—")),
      verify || (emailing && u.verified ? h("span", { class: "badge accent" }, "Verified") : null)
    )
  );

  if (u.provider) {
    list.appendChild(
      h(
        "div",
        { class: "list-row inset" },
        h("span", { class: "icon-chip", html: ICONS.unlock }),
        h("span", { class: "label" }, "Signs in with", h("span", { class: "sub" }, PROVIDERS[u.provider] || u.provider))
      )
    );
  }

  if (emailing && !u.offline) {
    list.appendChild(
      h(
        "button",
        {
          class: "list-row tappable",
          style: "width:100%;text-align:left",
          onclick: async () => {
            try {
              await resetPassword(u.email);
              toast(`A link to change your password was sent to ${u.email}`, 4000);
            } catch (err) {
              toast(err.message || "Couldn't send the link", 3000);
            }
          },
        },
        h("span", { class: "icon-chip", html: ICONS.sliders }),
        h("span", { class: "label" }, "Change password", h("span", { class: "sub" }, "We'll email you a link")),
        h("span", { class: "chevron", html: ICONS.chevron })
      )
    );
  }

  return h("div", {}, h("div", { class: "section-header" }, "Details"), list);
}

function signOutButton() {
  return h(
    "div",
    {},
    h(
      "button",
      {
        class: "btn danger block mt",
        onclick: async () => {
          await signOut();
          toast("Signed out");
        },
      },
      "Sign out"
    ),
    h("p", { class: "list-footnote" }, "Your decks and progress stay on this device after you sign out.")
  );
}
