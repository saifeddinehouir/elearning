import { h } from "../dom.js";
import { getDailyPool, getAllStudyDays, getSettings, studiedToday, listDecks } from "../store.js";
import { composeSession } from "../session.js";
import { currentStreak } from "../streak.js";
import { startSession } from "./session.js";
import { openImport } from "./import.js";
import { openSettings } from "./settings.js";

export async function renderDaily() {
  const [pool, studyDays, decks, didToday] = await Promise.all([
    getDailyPool(),
    getAllStudyDays(),
    listDecks(),
    studiedToday(),
  ]);
  const settings = getSettings();
  const config = { size: settings.dailyGoal, newLimitRatio: settings.newLimitRatio };

  const wrap = h("div", {});
  wrap.appendChild(
    h(
      "div",
      { class: "row between" },
      h("h1", { class: "screen-title" }, "Today"),
      h("button", { class: "btn", onclick: () => openSettings(), "aria-label": "Settings" }, "⚙")
    )
  );

  if (decks.length === 0) {
    wrap.appendChild(
      empty("📥", "No decks yet", "Generate questions with ChatGPT or Claude using the JSON schema, then import them.", {
        label: "Import a deck",
        onclick: () => openImport(),
      })
    );
    return wrap;
  }

  if (pool.length === 0) {
    wrap.appendChild(
      empty("🗂", "No decks in your daily mix", 'Turn on "Include in daily mix" for a deck, or study one on its own from the Decks tab.')
    );
    return wrap;
  }

  const comp = composeSession(pool, config);
  const today = studyDays.find((d) => sameDay(d.dayStart));
  const answeredToday = today ? today.answered : 0;

  wrap.appendChild(
    h(
      "div",
      { class: "tiles" },
      tile(currentStreak(studyDays), "Day streak"),
      tile(`${answeredToday}/${settings.dailyGoal}`, "Answered today"),
      tile(comp.total, "In queue")
    )
  );

  const card = h("div", { class: "card" });
  card.appendChild(h("div", { class: "section-title" }, "Today's session"));
  card.appendChild(compRow("var(--accent)", "Due reviews", comp.due));
  card.appendChild(compRow("var(--purple)", "New questions", comp.new));
  if (comp.ahead > 0) card.appendChild(compRow("var(--teal)", "Reviewed ahead", comp.ahead));

  card.appendChild(h("div", { class: "row between mt small muted" },
    h("span", {}, `${comp.total} question${comp.total === 1 ? "" : "s"}`),
    didToday ? h("span", {}, "✓ studied today") : h("span", {})
  ));

  const startBtn = h(
    "button",
    {
      class: "btn primary block lg mt",
      disabled: comp.total === 0,
      onclick: () => startSession(pool, config),
    },
    answeredToday > 0 ? "Study more" : "Start daily session"
  );
  card.appendChild(startBtn);
  if (comp.total === 0) {
    card.appendChild(h("p", { class: "small muted mt" }, "Nothing due and no new questions — you're all caught up. 🎉"));
  }
  wrap.appendChild(card);
  return wrap;
}

const sameDay = (ms) => new Date(ms).toDateString() === new Date().toDateString();

function tile(value, label) {
  return h("div", { class: "tile" }, h("div", { class: "v" }, String(value)), h("div", { class: "l" }, label));
}

function compRow(color, label, n) {
  return h(
    "div",
    { class: n === 0 ? "comp-row zero" : "comp-row" },
    h("span", { class: "dot", style: `background:${color}` }),
    h("span", {}, label),
    h("span", { class: "n" }, String(n))
  );
}

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
