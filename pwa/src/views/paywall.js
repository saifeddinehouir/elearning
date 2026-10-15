import { h, openOverlay, toast, ICONS } from "../dom.js";
import { getPlan } from "../store.js";
import { PRO_FEATURES, isPro } from "../plan.js";
import { OFFERS } from "../config.js";
import { accountsConfigured, currentUser, signIn, startCheckout } from "../account.js";

// Signs in if needed, then hands over to Stripe Checkout.
async function buy(offerId, button) {
  if (!accountsConfigured()) return toast("Payments aren't set up yet", 3000);
  button.disabled = true;
  try {
    if (!currentUser()) await signIn();
    if (!currentUser()) return; // closed the sign-in window, or redirecting
    toast("Opening checkout…");
    await startCheckout(offerId);
  } catch (err) {
    console.error(err);
    toast(err.message || "Couldn't open checkout. Try again.", 3500);
  } finally {
    button.disabled = false;
  }
}

// The "what Pro adds" sheet. `reason` names what the user just tried to open.
export function openPaywall(reason = "") {
  openOverlay((close) => {
    const pro = isPro(getPlan());
    const overlay = h("div", { class: "overlay" });
    const head = h("div", { class: "o-head" });
    const body = h("div", { class: "o-body" });
    overlay.append(head, body);
    head.append(h("button", { class: "btn", onclick: close }, "Close"), h("strong", {}, "DailyQCM Pro"), h("div", { class: "spacer" }));

    body.appendChild(
      h(
        "div",
        { class: "card promo pro" },
        h("div", { class: "kicker" }, pro ? "You have Pro" : reason ? `${reason} is part of Pro` : "Pro"),
        h("div", { class: "promo-title" }, "Study what interviews actually ask"),
        h("p", { class: "small muted", style: "margin:4px 0 0" }, "Daily sessions, streaks, stats and importing your own decks stay free. Pro adds the content and the shortcuts.")
      )
    );

    const list = h("div", { class: "list" });
    for (const f of PRO_FEATURES) {
      list.appendChild(
        h(
          "div",
          { class: "list-row inset" },
          h("span", { class: "icon-chip c-accent", html: f.live ? ICONS.unlock : ICONS.sparkle }),
          h("span", { class: "label" }, f.title, h("span", { class: "sub" }, f.sub)),
          f.live ? null : h("span", { class: "badge" }, "Soon")
        )
      );
    }
    body.appendChild(list);

    if (!pro) {
      body.appendChild(h("div", { class: "section-header" }, "Get Pro"));
      for (const offer of OFFERS) {
        body.appendChild(
          h(
            "button",
            { class: "card option", onclick: (e) => buy(offer.id, e.currentTarget) },
            h(
              "span",
              { class: "spacer" },
              h("span", { class: "option-title" }, offer.title),
              h("span", { class: "option-sub" }, offer.sub)
            ),
            offer.price ? h("strong", {}, offer.price) : null,
            h("span", { class: "chevron", html: ICONS.chevron })
          )
        );
      }
      body.appendChild(
        h("p", { class: "list-footnote" }, "Payment is handled by Stripe. Anything already on this device stays yours, whatever your plan.")
      );
    }
    return overlay;
  });
}

// Small inline marker for Pro-only content.
export const proBadge = () => h("span", { class: "badge pro" }, "Pro");
