import { h, openOverlay, toast, ICONS } from "../dom.js";
import { getSettings, setSettings, getPlan, getDecksPool, listDecks } from "../store.js";
import { hasFeature } from "../plan.js";
import { isActive, daysLeft, withInterviewDue, planToday, readiness, focusDeckIds, paceFor, MAX_SESSION } from "../interview.js";
import { LIBRARIES, libraryOfDeck } from "../library.js";
import { PATHS, pathOfPattern } from "../patterns.js";
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

// What Today studies: the daily mix (or the interview's chosen decks) with
// interview dates applied, and the session config that follows today's plan.
// Falls back to the normal setup when no interview is in force.
export async function todaySetup(dailyPool, decks, settings = getSettings()) {
  const base = { size: settings.dailyGoal, newLimitRatio: settings.newLimitRatio };
  const iv = activeInterview(settings);
  if (!iv) return { pool: dailyPool, config: base, plan: null, interview: null, focus: null };
  const focus = focusDeckIds(iv, decks.map((d) => d.id));
  const pool = withInterviewDue(focus ? await getDecksPool(focus) : dailyPool, iv.date);
  const plan = planToday(pool, iv, settings.dailyGoal);
  return { pool, config: { ...base, size: plan.size, newLimit: plan.newToday }, plan, interview: iv, focus };
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
        h("div", { class: "kicker" }, `Interview · ${fmtDateFull(iv.date)}${setup.focus ? ` · ${setup.focus.length} deck${setup.focus.length === 1 ? "" : "s"}` : ""}`),
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

// Decks grouped the way the Decks tab shows them: your own, then each
// library, then each pattern path, each in study order.
function deckGroups(decks) {
  const inOrder = (list) => [...list].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const groups = [];
  const own = decks.filter((d) => !d.libraryKey && !d.builtinKey);
  if (own.length) groups.push({ name: "Your decks", decks: inOrder(own) });
  for (const lib of LIBRARIES) {
    const g = decks.filter((d) => libraryOfDeck(d) === lib);
    if (g.length) groups.push({ name: lib.name, decks: inOrder(g) });
  }
  for (const path of PATHS) {
    const g = decks.filter((d) => d.builtinKey && pathOfPattern.get(d.builtinKey) === path);
    if (g.length) groups.push({ name: path.name, decks: inOrder(g) });
  }
  return groups;
}

const unseenIn = (decks) => decks.reduce((n, d) => n + Math.round(d.questionCount * (1 - d.studiedFraction)), 0);

export async function openInterviewSheet() {
  if (!available()) return openPaywall("Interview date mode");
  const decks = await listDecks();
  openOverlay((close) => {
    const iv = getSettings().interview;
    const today = startOfDay().getTime();
    // Moving the date keeps the original notice, so the reserved review days
    // don't shrink just because it was edited.
    const setOn = iv && isActive(iv.date) ? Math.min(iv.setOn, today) : today;
    const overlay = h("div", { class: "overlay" });
    const head = h("div", { class: "o-head" });
    const body = h("div", { class: "o-body" });
    overlay.append(head, body);
    head.append(h("button", { class: "btn", onclick: close }, "Cancel"), h("strong", {}, "Interview date"), h("div", { class: "spacer" }));

    const input = h("input", {
      type: "date",
      min: toInputValue(today),
      value: toInputValue(iv && iv.date >= today ? iv.date : addDays(today, 14).getTime()),
      onchange: () => paint(),
    });
    body.appendChild(h("div", { class: "list", style: "padding:12px 16px" }, input));

    // ---------- What to study ----------
    const focus = iv ? focusDeckIds(iv, decks.map((d) => d.id)) : null;
    let mode = focus ? "choose" : "mix";
    const selected = new Set(focus || decks.filter((d) => d.includeInMix !== false).map((d) => d.id));
    const chosenDecks = () => (mode === "mix" ? decks.filter((d) => d.includeInMix !== false) : decks.filter((d) => selected.has(d.id)));

    body.appendChild(h("div", { class: "section-header" }, "What to study"));
    const modeWrap = h("div", { class: "list", style: "padding:12px 16px" });
    const modeControl = h("div", { class: "segmented" });
    const modeButtons = [
      ["mix", "My daily mix"],
      ["choose", "Choose decks"],
    ].map(([val, label]) => {
      const b = h("button", { onclick: () => { mode = val; paint(); } }, label);
      b.dataset.val = val;
      modeControl.appendChild(b);
      return b;
    });
    modeWrap.appendChild(modeControl);
    body.appendChild(modeWrap);

    const picker = h("div", {});
    const groupBoxes = [];
    const boxById = new Map();
    for (const g of deckGroups(decks)) {
      const groupBox = h("input", {
        type: "checkbox",
        class: "check",
        onchange: (e) => {
          for (const d of g.decks) e.target.checked ? selected.add(d.id) : selected.delete(d.id);
          paint();
        },
      });
      groupBoxes.push({ box: groupBox, decks: g.decks });
      picker.appendChild(
        h("label", { class: "list-row inset group-row" }, groupBox, h("span", { class: "label" }, g.name, h("span", { class: "sub" }, `${g.decks.length} deck${g.decks.length === 1 ? "" : "s"}`)))
      );
      const list = h("div", { class: "list" });
      for (const d of g.decks) {
        const box = h("input", {
          type: "checkbox",
          class: "check",
          checked: selected.has(d.id),
          onchange: (e) => {
            e.target.checked ? selected.add(d.id) : selected.delete(d.id);
            paint();
          },
        });
        boxById.set(d.id, box);
        list.appendChild(
          h(
            "label",
            { class: "list-row inset" },
            box,
            h("span", { class: "label" }, d.name, h("span", { class: "sub" }, `${d.questionCount} questions · ${pct(d.studiedFraction)} seen`))
          )
        );
      }
      picker.appendChild(list);
    }
    body.appendChild(picker);

    const summary = h("p", { class: "small", style: "margin:12px 0 0" });
    body.appendChild(summary);
    body.appendChild(
      h(
        "p",
        { class: "list-footnote" },
        "Until the interview, Today studies only these decks. Reviews that would fall after it are brought forward, unseen questions are spread over the days left, and the final day or two are kept for review. Other decks pause until then. Remove the date and everything goes back to normal."
      )
    );

    function paint() {
      for (const b of modeButtons) b.classList.toggle("active", b.dataset.val === mode);
      picker.style.display = mode === "choose" ? "" : "none";
      for (const [id, box] of boxById) box.checked = selected.has(id);
      for (const { box, decks: g } of groupBoxes) {
        const n = g.filter((d) => selected.has(d.id)).length;
        box.checked = n === g.length;
        box.indeterminate = n > 0 && n < g.length;
      }
      const chosen = chosenDecks();
      const questions = chosen.reduce((n, d) => n + d.questionCount, 0);
      const unseen = unseenIn(chosen);
      const date = fromInputValue(input.value);
      const pace = date !== null && date >= today ? paceFor(unseen, { date, setOn }) : 0;
      summary.textContent = chosen.length === 0
        ? "Pick at least one deck."
        : `${chosen.length} deck${chosen.length === 1 ? "" : "s"} · ${questions} questions · ${unseen} not seen yet` +
          (unseen > 0 && pace > 0 ? ` · about ${pace} new a day` : "");
      summary.style.color = pace > MAX_SESSION ? "var(--bad)" : "";
      if (pace > MAX_SESSION) summary.textContent += `. That's more than a day's session can hold (${MAX_SESSION}), so narrow it down or pick a later date.`;
    }
    paint();

    body.appendChild(
      h(
        "button",
        {
          class: "btn primary block mt",
          onclick: () => {
            const date = fromInputValue(input.value);
            if (date === null || date < today) return toast("Pick today or a later date");
            if (chosenDecks().length === 0) return toast("Pick at least one deck");
            const next = { date, setOn };
            if (mode === "choose") next.deckIds = [...selected].filter((id) => decks.some((d) => d.id === id));
            setSettings({ interview: next });
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
