import { h, ICONS } from "../dom.js";
import { CHALLENGES, challengeForDay, pickChallenge, challengeStreak, weekDays, msUntilTomorrow } from "../challenge.js";
import { getTodaysChallenge, listChallengeRecords, saveChallengeResult } from "../store.js";
import { startOfDay } from "../format.js";
import { runSession } from "./session.js";

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

// The Today-screen card for the day's challenge: theme, week strip, and either
// a Start button or today's result. `onNeedContent` is called from the empty
// state (no questions anywhere yet).
export async function challengeCard({ onNeedContent } = {}) {
  const def = challengeForDay();
  const [today, records] = await Promise.all([getTodaysChallenge(def, pickChallenge), listChallengeRecords()]);
  const rec = today.record;
  const done = !!rec?.completedAt;
  const streak = challengeStreak(records);
  const n = today.questions.length;

  const card = h("div", { class: `card challenge${done ? " done" : ""}`, style: `--c: var(--${def.color})` });

  card.appendChild(
    h(
      "div",
      { class: "row", style: "align-items:flex-start;gap:14px" },
      h("div", { class: "challenge-emoji", "aria-hidden": "true" }, def.emoji),
      h(
        "div",
        { class: "spacer" },
        h("div", { class: "kicker" }, `Daily challenge · ${weekdayName()}`),
        h("div", { class: "challenge-name" }, def.name),
        h(
          "div",
          { class: "small muted", style: "margin-top:2px" },
          today.focus ? `${def.blurb} Today: ${today.focus}.` : def.blurb
        )
      ),
      streak > 0 ? h("div", { class: "challenge-streak", title: "Challenge streak" }, `🔥 ${streak}`) : null
    )
  );

  card.appendChild(weekStrip(records));

  if (n === 0) {
    card.appendChild(
      h("p", { class: "small muted", style: "margin-top:12px" }, "Challenges draw from all your decks. Add one — or start the LeetCode Patterns path — to unlock them.")
    );
    if (onNeedContent) card.appendChild(h("button", { class: "btn block mt", onclick: onNeedContent }, "Start the LeetCode Patterns path"));
    return card;
  }

  const meta = [`${n} question${n === 1 ? "" : "s"}`, def.timeLimitSec ? `${def.timeLimitSec}s each` : `~${Math.max(1, Math.round(n * 0.5))} min`];
  if (!today.themed) meta.push("mixed set — not enough themed questions yet");

  if (done) {
    card.appendChild(
      h(
        "div",
        { class: "challenge-result" },
        h("span", { class: "icon-chip c-green", html: ICONS.trophy }),
        h(
          "div",
          { class: "spacer" },
          h("div", { style: "font-weight:700" }, `Done — ${rec.score}/${rec.total}`),
          h("div", { class: "small muted" }, `Best ${rec.bestScore}/${rec.total} · next challenge in ${countdown()}`)
        ),
        h("button", { class: "btn", onclick: () => launch(def, today.questions, { practice: true }) }, "Replay")
      )
    );
  } else {
    card.appendChild(h("div", { class: "meta", style: "margin:12px 0 12px" }, ...meta.map((m) => h("span", {}, m))));
    card.appendChild(
      h(
        "button",
        { class: "btn challenge-btn block lg", onclick: () => launch(def, today.questions) },
        h("span", { html: ICONS.play }),
        "Start challenge"
      )
    );
  }
  return card;
}

function launch(def, questions, { practice = false } = {}) {
  runSession(questions, {
    title: `${def.emoji} ${def.name}${practice ? " · replay" : ""}`,
    practice,
    timeLimitSec: def.timeLimitSec,
    showCombo: true,
    onFinish: async ({ correct, answered }) => {
      const rec = await saveChallengeResult(def, correct, answered);
      const streak = challengeStreak(await listChallengeRecords());
      const perfect = correct === answered;
      return h(
        "div",
        { class: "card challenge-summary", style: `--c: var(--${def.color})` },
        h("div", { class: "kicker" }, perfect ? "Perfect run" : "Daily challenge complete"),
        h("div", { class: "challenge-name" }, `${def.emoji} ${def.name} · ${correct}/${answered}`),
        h(
          "div",
          { class: "meta", style: "margin:8px 0 0" },
          h("span", {}, `🔥 ${streak}-day challenge streak`),
          h("span", {}, `Best today ${rec.bestScore}/${answered}`)
        )
      );
    },
  });
}

// Mon → Sun of this week: done days filled, today ringed.
function weekStrip(records) {
  const byDay = new Map(records.map((r) => [r.dayStart, r]));
  const today = startOfDay().getTime();
  return h(
    "div",
    { class: "week-strip" },
    ...weekDays().map((day) => {
      const dow = new Date(day).getDay();
      const r = byDay.get(day);
      const state = r?.completedAt ? "done" : day === today ? "today" : day < today ? "missed" : "future";
      return h(
        "div",
        { class: `wd ${state}`, title: CHALLENGES[dow].name },
        h("span", { class: "wd-dot" }, state === "done" ? "✓" : CHALLENGES[dow].emoji),
        h("span", { class: "wd-l" }, DAY_LETTERS[dow])
      );
    })
  );
}

const weekdayName = () => new Date().toLocaleDateString(undefined, { weekday: "long" });

function countdown() {
  const mins = Math.ceil(msUntilTomorrow() / 60000);
  const hrs = Math.floor(mins / 60);
  return hrs > 0 ? `${hrs}h ${mins % 60}m` : `${mins}m`;
}
