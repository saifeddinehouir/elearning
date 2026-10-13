import { h } from "../dom.js";
import { getAllAttempts } from "../store.js";
import { overall, byTopic, byDifficulty, byDeck, daily } from "../stats.js";
import { horizontalBars, verticalBars, lineChart, ring } from "../charts.js";
import { pct } from "../format.js";
import { PATHS } from "../patterns.js";
import { empty } from "./daily.js";

let windowDays = 30;

export async function renderStats() {
  const attempts = await getAllAttempts();
  const wrap = h("div", {});
  wrap.appendChild(h("h1", { class: "screen-title" }, "Stats"));

  if (attempts.length === 0) {
    wrap.appendChild(
      empty("📊", "No stats yet", "Finish a daily session and your accuracy by topic, difficulty and deck shows up here.")
    );
    return wrap;
  }

  const o = overall(attempts);
  const last7 = daily(attempts, 7);
  const weekAnswered = last7.reduce((s, d) => s + d.answered, 0);
  const weekCorrect = last7.reduce((s, d) => s + d.correct, 0);
  wrap.appendChild(
    h(
      "div",
      { class: "card hero" },
      h(
        "div",
        { class: "hero-top" },
        ring(o.rate, { size: 112, stroke: 11, color: rateVar(o.rate), label: pct(o.rate), sub: "all-time" }),
        h(
          "div",
          { class: "hero-stats" },
          stat(o.answered, "answered"),
          stat(o.correct, "correct"),
          stat(weekAnswered ? pct(weekCorrect / weekAnswered) : "—", "accuracy this week")
        )
      )
    )
  );

  const topics = byTopic(attempts, true);
  for (const path of PATHS) {
    const grid = masteryGrid(path, topics);
    if (grid) wrap.appendChild(grid);
  }

  wrap.appendChild(
    card("Accuracy over time", [
      segmented(
        [
          [7, "7d"],
          [30, "30d"],
          [90, "90d"],
        ],
        windowDays,
        (v) => {
          windowDays = v;
          renderStats().then((n) => wrap.replaceWith(n));
        }
      ),
      lineChart(daily(attempts, windowDays)),
    ])
  );

  wrap.appendChild(card("Accuracy by topic (weakest first)", [horizontalBars(topics)]));
  wrap.appendChild(card("Accuracy by difficulty", [verticalBars(byDifficulty(attempts).map((b) => ({ label: cap(b.label), rate: b.rate })))]));
  wrap.appendChild(card("Accuracy by deck", [horizontalBars(byDeck(attempts))]));
  return wrap;
}

// One tile per pattern in a path, coloured by accuracy: the fastest way to see
// which patterns you still can't recognise. Hidden until the path has answers.
function masteryGrid(path, topics) {
  const byName = new Map(topics.map((t) => [t.label, t]));
  const tried = path.patterns.filter((p) => byName.has(p.name)).length;
  if (tried === 0) return null;
  return h(
    "div",
    { class: `card${path.tone === "hard" ? " builtin-path hard" : ""}` },
    h(
      "div",
      { class: "row between", style: "margin-bottom:12px" },
      h("div", { class: "section-title", style: "margin:0" }, `${path.name} mastery`),
      h("span", { class: "small muted" }, `${tried}/${path.patterns.length} tried`)
    ),
    h(
      "div",
      { class: "mastery-grid" },
      ...path.patterns.map((p, i) => {
        const t = byName.get(p.name);
        return h(
          "div",
          {
            class: `mtile${t ? "" : " untried"}`,
            style: t ? `--mc:${rateVar(t.rate)}` : "",
            title: t ? `${p.name}: ${pct(t.rate)} of ${t.total}` : `${p.name}: not tried yet`,
          },
          h("span", { class: "mtile-num" }, String(i + 1).padStart(2, "0")),
          h("span", { class: "mtile-name" }, p.name),
          h("span", { class: "mtile-v" }, t ? pct(t.rate) : "—")
        );
      })
    ),
    h(
      "div",
      { class: "legend", style: "margin-top:12px" },
      ...[
        ["var(--red)", "< 40%"],
        ["var(--orange)", "40–60%"],
        ["var(--yellow)", "60–80%"],
        ["var(--green)", "80%+"],
      ].map(([c, l]) => h("span", { class: "legend-item" }, h("span", { class: "d", style: `background:${c}` }), l))
    )
  );
}

const rateVar = (r) => (r >= 0.8 ? "var(--green)" : r >= 0.6 ? "var(--yellow)" : r >= 0.4 ? "var(--orange)" : "var(--red)");

function stat(value, label) {
  return h("div", { class: "hero-stat" }, h("span", { class: "hero-v" }, String(value)), h("span", { class: "hero-l" }, label));
}
function card(title, children) {
  return h("div", { class: "card" }, h("div", { class: "section-title" }, title), ...children);
}
function segmented(options, selected, onSelect) {
  return h(
    "div",
    { class: "segmented", style: "margin-bottom:12px" },
    ...options.map(([v, label]) =>
      h(
        "button",
        {
          class: v === selected ? "active" : "",
          onclick: () => onSelect(v),
        },
        label
      )
    )
  );
}
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
