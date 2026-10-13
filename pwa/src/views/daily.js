import { h, toast, ICONS } from "../dom.js";
import { getDailyPool, getAllStudyDays, getSettings, listDecks, getPatternPath, loadSampleDeck } from "../store.js";
import { composeSession } from "../session.js";
import { currentStreak } from "../streak.js";
import { ring } from "../charts.js";
import { startSession } from "./session.js";
import { openImport } from "./import.js";
import { openSettings } from "./settings.js";
import { challengeCard } from "./challenge.js";
import { installAndOpenPath, openRoadmapDetail, pathPromoCard } from "./roadmaps.js";
import { openDeckDetail } from "./decks.js";
import { openCheatSheet } from "./guide.js";

export async function renderDaily() {
  const [pool, studyDays, decks, patternPath] = await Promise.all([
    getDailyPool(),
    getAllStudyDays(),
    listDecks(),
    getPatternPath(),
  ]);
  const settings = getSettings();
  const config = { size: settings.dailyGoal, newLimitRatio: settings.newLimitRatio };

  const wrap = h("div", {});
  wrap.appendChild(
    h(
      "div",
      { class: "row between screen-head" },
      h(
        "div",
        {},
        h("div", { class: "kicker" }, new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })),
        h("h1", { class: "screen-title" }, greeting())
      ),
      h("button", { class: "btn icon-btn", onclick: () => openSettings(), "aria-label": "Settings", html: ICONS.gear })
    )
  );

  if (decks.length === 0) {
    wrap.appendChild(welcome());
    return wrap;
  }

  const today = studyDays.find((d) => sameDay(d.dayStart));
  const answeredToday = today ? today.answered : 0;
  const streakN = currentStreak(studyDays);
  wrap.appendChild(goalCard(pool, config, settings.dailyGoal, answeredToday, streakN));

  wrap.appendChild(await challengeCard({ onNeedContent: installAndOpenPath }));

  if (patternPath) {
    const next = upNextCard(patternPath, decks);
    if (next) wrap.appendChild(next);
  } else {
    wrap.appendChild(pathPromoCard());
  }
  return wrap;
}

function greeting() {
  const hr = new Date().getHours();
  if (hr < 5) return "Late night";
  if (hr < 12) return "Good morning";
  if (hr < 18) return "Good afternoon";
  return "Good evening";
}

// Hero: ring for today's goal, streak, and what the session holds.
function goalCard(pool, config, goal, answeredToday, streakN) {
  const comp = composeSession(pool, config);
  const reached = answeredToday >= goal;
  const card = h("div", { class: "card hero" });

  card.appendChild(
    h(
      "div",
      { class: "hero-top" },
      ring(answeredToday / goal, {
        size: 112,
        stroke: 11,
        color: reached ? "var(--green)" : "var(--accent)",
        label: String(answeredToday),
        sub: `of ${goal} today`,
      }),
      h(
        "div",
        { class: "hero-stats" },
        h(
          "div",
          { class: "hero-stat" },
          h("span", { class: "hero-v", style: streakN > 0 ? "color:var(--orange)" : "" }, `🔥 ${streakN}`),
          h("span", { class: "hero-l" }, "day streak")
        ),
        h(
          "div",
          { class: "hero-pills" },
          pill("var(--accent)", comp.due, "due"),
          pill("var(--purple)", comp.new, "new"),
          comp.ahead > 0 ? pill("var(--teal)", comp.ahead, "ahead") : null
        )
      )
    )
  );

  if (pool.length === 0) {
    card.appendChild(
      h("p", { class: "small muted mt" }, 'No decks are in your daily mix. Turn on "Include in daily mix" for a deck, or study one on its own from the Decks tab.')
    );
    return card;
  }

  card.appendChild(
    h(
      "button",
      {
        class: "btn primary block lg mt",
        disabled: comp.total === 0,
        onclick: () => startSession(pool, config),
      },
      comp.total === 0
        ? "All caught up 🎉"
        : answeredToday > 0
        ? `Study more · ${comp.total} questions`
        : `Start daily session · ${comp.total} questions`
    )
  );
  if (reached) card.appendChild(h("p", { class: "small muted", style: "text-align:center;margin-top:8px" }, "Daily goal reached. Anything more is a bonus."));
  return card;
}

function pill(color, n, label) {
  return h(
    "span",
    { class: `pill${n === 0 ? " zero" : ""}`, style: `--pc:${color}` },
    h("strong", {}, String(n)),
    ` ${label}`
  );
}

// "Up next" for the built-in pattern path: the first stage not finished yet.
function upNextCard(path, decks) {
  const deckById = new Map(decks.map((d) => [d.id, d]));
  const idx = path.nodes.findIndex((n) => {
    const d = deckById.get(n.deckId);
    return !(d && d.studiedFraction >= 0.999);
  });
  const total = path.nodes.length;
  if (idx === -1) {
    return h(
      "div",
      { class: "card builtin-path", role: "button", tabindex: "0", onclick: () => openRoadmapDetail(path.id) },
      h("div", { class: "kicker" }, path.name),
      h("div", { class: "promo-title" }, "🎉 Every pattern studied"),
      h("p", { class: "small muted", style: "margin-top:4px" }, "Reviews keep coming back on schedule. Skim the cheat sheet before an interview.")
    );
  }
  const node = path.nodes[idx];
  const deck = deckById.get(node.deckId);
  const pctDone = deck ? Math.round(deck.studiedFraction * 100) : 0;
  const prog = h("div", { class: "progress", style: "margin-top:10px" }, h("i", {}));
  prog.firstChild.style.width = `${pctDone}%`;

  return h(
    "div",
    { class: "card builtin-path" },
    h(
      "div",
      { class: "row", style: "align-items:flex-start" },
      h(
        "div",
        { class: "spacer" },
        h("div", { class: "kicker" }, `Up next · stage ${idx + 1} of ${total}`),
        h("div", { class: "promo-title" }, node.title),
        h("div", { class: "small muted", style: "margin-top:2px" }, node.description)
      ),
      h("span", { class: "stage-num" }, String(idx + 1).padStart(2, "0"))
    ),
    prog,
    h("div", { class: "small muted", style: "margin-top:6px" }, `${pctDone}% seen${deck ? ` · ${deck.questionCount} questions` : ""}`),
    h(
      "div",
      { class: "row", style: "gap:10px;margin-top:12px" },
      deck ? h("button", { class: "btn block", onclick: () => openDeckDetail(deck.id) }, "Open stage") : null,
      h("button", { class: "btn block", onclick: () => openRoadmapDetail(path.id) }, "Full path"),
      h("button", { class: "btn icon-btn", "aria-label": "Pattern cheat sheet", onclick: openCheatSheet, html: ICONS.list })
    )
  );
}

// First run: two clear ways in.
function welcome() {
  const box = h("div", {});
  box.appendChild(
    h(
      "div",
      { class: "card hero welcome" },
      h("div", { class: "welcome-emoji" }, "🧠"),
      h("div", { class: "promo-title", style: "text-align:center" }, "Learn it once. Remember it for good."),
      h(
        "p",
        { class: "small muted", style: "text-align:center;margin:6px 0 4px" },
        "Short daily sessions, scheduled by spaced repetition, plus a fresh challenge every day."
      )
    )
  );
  box.appendChild(
    h(
      "button",
      { class: "card option", onclick: installAndOpenPath },
      h("span", { class: "icon-chip c-purple lg", html: ICONS.code }),
      h(
        "span",
        { class: "spacer" },
        h("span", { class: "option-title" }, "Start the LeetCode Patterns path"),
        h("span", { class: "option-sub" }, "20 patterns, built in. Learn to recognise which one a problem needs.")
      ),
      h("span", { class: "chevron", html: ICONS.chevron })
    )
  );
  box.appendChild(
    h(
      "button",
      { class: "card option", onclick: () => openImport() },
      h("span", { class: "icon-chip c-accent lg", html: ICONS.book }),
      h(
        "span",
        { class: "spacer" },
        h("span", { class: "option-title" }, "Import your own deck"),
        h("span", { class: "option-sub" }, "Generate questions from course notes with ChatGPT or Claude, then paste the JSON.")
      ),
      h("span", { class: "chevron", html: ICONS.chevron })
    )
  );
  box.appendChild(
    h(
      "div",
      { class: "row", style: "justify-content:center;gap:8px;flex-wrap:wrap;margin-top:6px" },
      h("span", { class: "small muted" }, "Just looking?"),
      h("button", { class: "link-btn", onclick: () => sample("course") }, "Load a course sample")
    )
  );
  return box;

  async function sample(kind) {
    const r = await loadSampleDeck(kind);
    toast(`Loaded ${r.deck.name}`);
  }
}

const sameDay = (ms) => new Date(ms).toDateString() === new Date().toDateString();

export function empty(iconChar, title, message, action) {
  const box = h(
    "div",
    { class: "empty" },
    h("div", { class: "icon" }, iconChar),
    h("div", { class: "section-title" }, title),
    h("p", { class: "small" }, message)
  );
  if (action) box.appendChild(h("button", { class: "btn primary mt", onclick: action.onclick }, action.label));
  return box;
}
