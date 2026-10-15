import { h, openOverlay, toast, ICONS } from "../dom.js";
import { getSettings, setSettings, getPlan } from "../store.js";
import { hasFeature } from "../plan.js";
import { isActive, daysLeft, withInterviewDue, planToday, readiness } from "../interview.js";
import { startOfDay, addDays, fmtDateFull, pct } from "../format.js";
import { ring, horizontalBars } from "../charts.js";
import { openPaywall, proBadge } from "./paywall.js";

const FEATURE = "interview-date";
const available = () => hasFeature(getPlan(), FEATURE);

// The interview in force, or null (none set, passed, or not on this plan).
export function activeInterview(settings = getSettings()) {
  const iv = settings.interview;
  return iv && available() && isActive(iv.date) ? iv : null;
}

// What Today studies: the daily pool with interview dates applied, and the
// session config that follows today's plan. Falls back to the normal setup.
export function dailySetup(pool, settings = getSettings()) {
  const base = { size: settings.dailyGoal, newLimitRatio: settings.newLimitRatio };
  const iv = activeInterview(settings);
  if (!iv) return { pool, config: base, plan: null, interview: null };
  const planned = withInterviewDue(pool, iv.date);
  const plan = planToday(planned, iv, settings.dailyGoal);
  return { pool: planned, config: { ...base, size: plan.size, newLimit: plan.newToday }, plan, interview: iv };
}

const whenText = (left) => (left === 0 ? "Today" : left === 1 ? "Tomorrow" : `${left} days`);

// Today-screen card: the countdown and today's share when a date is set, an
// invitation when it isn't, a wrap-up once it has passed.
export function interviewCard(pool, setup) {
  const settings = getSettings();
  const iv = settings.interview;

  if (!available()) {
    return h(
      "button",
      { class: "card option", onclick: () => openPaywall("Interview date mode") },
      h("span", { class: "icon-chip lg", html: ICONS.target }),
      h(
        "span",
        { class: "spacer" },
        h("span", { class: "option-title" }, "Interview coming up?", proBadge()),
        h("span", { class: "option-sub" }, "Set the date and every review is paced to land before it.")
      ),
      h("span", { class: "chevron", html: ICONS.chevron })
    );
  }

  if (iv && daysLeft(iv.date) < 0) {
    return h(
      "div",
      { class: "card" },
      h("div", { class: "kicker" }, `Interview · ${fmtDateFull(iv.date)}`),
      h("div", { class: "promo-title" }, "How did it go?"),
      h("p", { class: "small muted", style: "margin:4px 0 12px" }, "Your reviews are back on their normal schedule. Set a new date when the next one is booked."),
      h(
        "div",
        { class: "row", style: "gap:10px" },
        h("button", { class: "btn primary block", onclick: () => openInterviewSheet() }, "Next interview"),
        h("button", { class: "btn", onclick: () => setSettings({ interview: null }) }, "Dismiss")
      )
    );
  }

  if (!setup.plan) {
    return h(
      "button",
      { class: "card option", onclick: () => openInterviewSheet() },
      h("span", { class: "icon-chip lg", html: ICONS.target }),
      h(
        "span",
        { class: "spacer" },
        h("span", { class: "option-title" }, "Interview coming up?"),
        h("span", { class: "option-sub" }, "Set the date and every review is paced to land before it.")
      ),
      h("span", { class: "chevron", html: ICONS.chevron })
    );
  }

  const { plan } = setup;
  const r = readiness(setup.pool);
  const todayLine = plan.daysLeft === 0
    ? "Interview day: a light review, then go get it."
    : plan.reviewOnly
    ? `Review only from here: ${plan.dueToday} due today.`
    : `Today: ${plan.newToday} new · ${plan.dueToday} review${plan.dueToday === 1 ? "" : "s"}`;
  const paceLine = plan.daysLeft === 0
    ? null
    : plan.reviewOnly || plan.unseen === 0
    ? plan.unseen > 0 ? `${plan.unseen} questions won't be seen before the interview.` : "Every question has been seen at least once."
    : `${plan.newPerDay} new a day covers the ${plan.unseen} you haven't seen.`;

  const weakest = r.topics.filter((t) => t.rate < 1).slice(0, 3);
  return h(
    "div",
    { class: "card" },
    h(
      "div",
      { class: "row between", style: "align-items:flex-start" },
      h(
        "div",
        { class: "spacer" },
        h("div", { class: "kicker" }, `Interview · ${fmtDateFull(iv.date)}`),
        h("div", { class: "promo-title" }, whenText(plan.daysLeft)),
        h("div", { class: "small muted", style: "margin-top:6px" }, todayLine),
        paceLine ? h("div", { class: "small muted", style: "margin-top:2px" }, paceLine) : null,
        plan.behind
          ? h("div", { class: "small", style: "margin-top:6px;color:var(--bad)" }, `That's more than ${plan.size} a day. Take some decks out of the daily mix to focus.`)
          : null
      ),
      ring(r.rate, { size: 84, label: String(Math.round(r.rate * 100)), unit: "%", sub: "Ready" })
    ),
    weakest.length
      ? h(
          "div",
          { class: "meta", style: "margin:12px 0 0" },
          h("span", {}, "Weakest:"),
          ...weakest.map((t) => h("span", {}, `${t.topic} ${pct(t.rate)}`))
        )
      : null,
    h(
      "div",
      { class: "row", style: "gap:10px;margin-top:12px" },
      h("button", { class: "btn block", onclick: () => openReadiness(setup.pool, iv) }, "Readiness by topic"),
      h("button", { class: "btn", onclick: () => openInterviewSheet() }, "Change date")
    )
  );
}

const toInputValue = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const fromInputValue = (v) => {
  const [y, m, d] = String(v).split("-").map(Number);
  return y && m && d ? new Date(y, m - 1, d).getTime() : null;
};

export function openInterviewSheet() {
  if (!available()) return openPaywall("Interview date mode");
  openOverlay((close) => {
    const iv = getSettings().interview;
    const today = startOfDay().getTime();
    const overlay = h("div", { class: "overlay" });
    const head = h("div", { class: "o-head" });
    const body = h("div", { class: "o-body" });
    overlay.append(head, body);
    head.append(h("button", { class: "btn", onclick: close }, "Cancel"), h("strong", {}, "Interview date"), h("div", { class: "spacer" }));

    const input = h("input", {
      type: "date",
      min: toInputValue(today),
      value: toInputValue(iv && iv.date >= today ? iv.date : addDays(today, 14).getTime()),
    });
    body.appendChild(h("div", { class: "list", style: "padding:12px 16px" }, input));
    body.appendChild(
      h(
        "p",
        { class: "list-footnote" },
        "Until then, reviews that would fall after the interview are brought forward, unseen questions are spread over the days left, and the final day or two are kept for review. It counts the decks in your daily mix. Remove the date and everything goes back to normal."
      )
    );
    body.appendChild(
      h(
        "button",
        {
          class: "btn primary block mt",
          onclick: () => {
            const date = fromInputValue(input.value);
            if (date === null || date < today) return toast("Pick today or a later date");
            // Moving the date keeps the original notice, so the reserved
            // review days don't shrink just because it was edited.
            const setOn = iv && isActive(iv.date) ? Math.min(iv.setOn, today) : today;
            setSettings({ interview: { date, setOn } });
            toast(`Planning for ${fmtDateFull(date)}`);
            close();
          },
        },
        "Save"
      )
    );
    if (iv) {
      body.appendChild(
        h(
          "button",
          {
            class: "btn block subtle mt",
            onclick: () => {
              setSettings({ interview: null });
              toast("Interview date removed");
              close();
            },
          },
          "Remove the date"
        )
      );
    }
    return overlay;
  });
}

function openReadiness(pool, iv) {
  openOverlay((close) => {
    const r = readiness(pool);
    const overlay = h("div", { class: "overlay" });
    const head = h("div", { class: "o-head" });
    const body = h("div", { class: "o-body" });
    overlay.append(head, body);
    head.append(h("button", { class: "btn", onclick: close }, "Done"), h("strong", {}, "Readiness"), h("div", { class: "spacer" }));

    body.appendChild(
      h(
        "div",
        { class: "card hero" },
        h(
          "div",
          { class: "hero-top" },
          ring(r.rate, { size: 120, label: String(Math.round(r.rate * 100)), unit: "%", sub: `${r.ready} of ${r.total} ready for ${fmtDateFull(iv.date)}` })
        )
      )
    );
    body.appendChild(h("div", { class: "section-header" }, "By topic, weakest first"));
    body.appendChild(h("div", { class: "card" }, horizontalBars(r.topics.map((t) => ({ label: t.topic, rate: t.rate, total: t.total })))));
    body.appendChild(
      h("p", { class: "list-footnote" }, "A question counts as ready when your latest answer to it was right. Ones you haven't seen yet count as not ready.")
    );
    return overlay;
  });
}
