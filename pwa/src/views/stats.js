import { h } from "../dom.js";
import { getAllAttempts } from "../store.js";
import { overall, byTopic, byDifficulty, byDeck, daily } from "../stats.js";
import { horizontalBars, verticalBars, lineChart } from "../charts.js";
import { pct } from "../format.js";
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
  wrap.appendChild(
    h(
      "div",
      { class: "tiles" },
      tile(o.answered, "Answered"),
      tile(o.correct, "Correct"),
      tile(pct(o.rate), "Accuracy")
    )
  );

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

  wrap.appendChild(card("Accuracy by topic (weakest first)", [horizontalBars(byTopic(attempts, true))]));
  wrap.appendChild(card("Accuracy by difficulty", [verticalBars(byDifficulty(attempts).map((b) => ({ label: cap(b.label), rate: b.rate })))]));
  wrap.appendChild(card("Accuracy by deck", [horizontalBars(byDeck(attempts))]));
  return wrap;
}

function card(title, children) {
  return h("div", { class: "card" }, h("div", { class: "section-title" }, title), ...children);
}
function tile(value, label) {
  return h("div", { class: "tile" }, h("div", { class: "v" }, String(value)), h("div", { class: "l" }, label));
}
function segmented(options, selected, onSelect) {
  return h(
    "div",
    { class: "row", style: "gap:6px;margin-bottom:10px" },
    ...options.map(([v, label]) =>
      h(
        "button",
        {
          class: v === selected ? "btn primary" : "btn",
          style: "padding:6px 12px;flex:1",
          onclick: () => onSelect(v),
        },
        label
      )
    )
  );
}
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
