import { h, toast, ICONS } from "../dom.js";
import { getDailyPool, getAllStudyDays, getSettings, listDecks, getPatternPaths, loadSampleDeck } from "../store.js";
import { PATHS, pathByKey, isStageDone, MASTERY } from "../patterns.js";
import { composeSession } from "../session.js";
import { currentStreak } from "../streak.js";
import { ring } from "../charts.js";
import { startSession } from "./session.js";
import { openImport } from "./import.js";
import { openSettings } from "./settings.js";
import { challengeCard } from "./challenge.js";
import { installAndOpenPath, installAndOpenLibrary, openRoadmapDetail, pathPromoCard, libraryPromoCard, pathClass } from "./roadmaps.js";
import { LIBRARIES } from "../library.js";
import { openDeckDetail } from "./decks.js";
import { openCheatSheet } from "./guide.js";

export async function renderDaily() {
  const [pool, studyDays, decks, installedPaths] = await Promise.all([
    getDailyPool(),
    getAllStudyDays(),
    listDecks(),
    getPatternPaths(),
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

  // One "up next" per installed path (in path order), then a pitch for the
  // first path you haven't started.
  for (const path of [...LIBRARIES, ...PATHS]) {
    const roadmap = installedPaths.find((r) => r.builtin === path.key);
    if (roadmap) wrap.appendChild(upNextCard(roadmap, decks));
  }
  // Pitch one library at a time so Today doesn't turn into a catalogue;
  // Roadmaps lists all of them.
  const nextLib = LIBRARIES.find((lib) => !installedPaths.some((r) => r.builtin === lib.key));
  if (nextLib) wrap.appendChild(libraryPromoCard(nextLib));
  const notYet = PATHS.find((p) => !installedPaths.some((r) => r.builtin === p.key));
  if (notYet) wrap.appendChild(pathPromoCard(notYet, { compact: installedPaths.length > 0 }));
  return wrap;
}

function greeting() {
  const hr = new Date().getHours();
  if (hr < 5) return "Late night";
  if (hr < 12) return "Good morning";
  if (hr < 18) return "Good afternoon";
  return "Good evening";
}

// Hero: today's count as a big numeral over its goal, then ruled rows for
// streak and what the session holds.
function goalCard(pool, config, goal, answeredToday, streakN) {
  const comp = composeSession(pool, config);
  const reached = answeredToday >= goal;
  const card = h("div", { class: "card hero" });

  card.appendChild(
    h(
      "div",
      { class: "hero-top" },
      ring(answeredToday / goal, {
        size: 150,
        color: reached ? "var(--accent)" : "var(--ink)",
        label: String(answeredToday).padStart(2, "0"),
        unit: `/${goal}`,
        sub: reached ? "Daily goal reached" : "Answered today",
      }),
      h(
        "div",
        { class: "stat-rows" },
        statRow("Streak", `${streakN} day${streakN === 1 ? "" : "s"}`, streakN === 0),
        statRow("Due · New", `${comp.due} · ${comp.new}`, comp.due + comp.new === 0),
        comp.ahead > 0 ? statRow("Review ahead", String(comp.ahead)) : null
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
        ? "All caught up"
        : answeredToday > 0
        ? `Study more · ${comp.total}`
        : `Start session · ${comp.total}`
    )
  );
  return card;
}

function statRow(label, value, zero = false) {
  return h("div", { class: "stat-row" }, h("span", {}, label), h("b", { class: zero ? "zero" : "" }, value));
}

// "Up next" for a built-in pattern path: the first stage not finished yet.
function upNextCard(path, decks) {
  const def = pathByKey.get(path.builtin);
  const rule = def?.unlock || "seen";
  const cls = `card${pathClass(def?.tone || "core")}`;
  const deckById = new Map(decks.map((d) => [d.id, d]));
  const idx = path.nodes.findIndex((n) => !isStageDone(deckById.get(n.deckId), rule));
  const total = path.nodes.length;
  if (idx === -1) {
    return h(
      "div",
      { class: cls, role: "button", tabindex: "0", onclick: () => openRoadmapDetail(path.id) },
      h("div", { class: "kicker" }, path.name),
      h("div", { class: "promo-title" }, "Every pattern studied"),
      h("p", { class: "small muted", style: "margin-top:4px" }, "Reviews keep coming back on schedule. Skim the cheat sheet before an interview.")
    );
  }
  const node = path.nodes[idx];
  const deck = deckById.get(node.deckId);
  const pctDone = deck ? Math.round(deck.studiedFraction * 100) : 0;
  const prog = h("div", { class: "progress", style: "margin-top:10px" }, h("i", {}));
  prog.firstChild.style.width = `${pctDone}%`;
  const status = [`${pctDone}% seen`];
  if (deck && rule === "mastery") status.push(`${Math.round(deck.mastery * 100)}% mastery (need ${Math.round(MASTERY * 100)}%)`);
  if (deck) status.push(`${deck.questionCount} questions`);

  return h(
    "div",
    { class: cls },
    h(
      "div",
      { class: "row", style: "align-items:flex-start" },
      h(
        "div",
        { class: "spacer" },
        h("div", { class: "kicker" }, `${path.name} · Stage ${String(idx + 1).padStart(2, "0")}/${total}`),
        h("div", { class: "promo-title" }, node.title),
        h("div", { class: "small muted", style: "margin-top:2px" }, node.description)
      ),
      h("span", { class: "stage-num" }, String(idx + 1).padStart(2, "0"))
    ),
    prog,
    h("div", { class: "small muted", style: "margin-top:6px" }, status.join(" · ")),
    h(
      "div",
      { class: "row", style: "gap:10px;margin-top:12px" },
      deck ? h("button", { class: "btn block", onclick: () => openDeckDetail(deck.id) }, "Open stage") : null,
      h("button", { class: "btn block", onclick: () => openRoadmapDetail(path.id) }, "Full path"),
      def ? h("button", { class: "btn icon-btn", "aria-label": "Pattern cheat sheet", onclick: () => openCheatSheet(path.builtin), html: ICONS.list }) : null
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
      h("div", { class: "kicker" }, "Spaced repetition · Java, DevOps & LeetCode"),
      h("div", { class: "promo-title" }, "Learn it once. Remember it for good."),
      h(
        "p",
        { class: "muted", style: "margin:10px 0 0;max-width:40ch" },
        "Short daily sessions, scheduled by spaced repetition, plus a fresh challenge every day."
      )
    )
  );
  for (const lib of LIBRARIES) {
    box.appendChild(
      h(
        "button",
        { class: "card option", onclick: () => installAndOpenLibrary(lib.key) },
        h("span", { class: "icon-chip lg", html: ICONS[lib.icon] || ICONS.book }),
        h(
          "span",
          { class: "spacer" },
          h("span", { class: "option-title" }, `Add the ${lib.name} decks`),
          h("span", { class: "option-sub" }, `${lib.deckCount} decks, ${lib.questionCount} questions: ${lib.short}.`)
        ),
        h("span", { class: "chevron", html: ICONS.chevron })
      )
    );
  }
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
      { class: "row", style: "gap:8px;flex-wrap:wrap;margin-top:14px;padding-top:12px;border-top:1px solid var(--hair)" },
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
