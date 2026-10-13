import { h, toast } from "../dom.js";
import { getAllStudyDays, listChallengeRecords } from "../store.js";
import { challengeStreak, longestChallengeStreak } from "../challenge.js";
import { currentStreak, longestStreak, totalDaysStudied } from "../streak.js";
import { heatmap } from "../charts.js";
import { startOfDay, fmtDateFull } from "../format.js";

export async function renderStreak() {
  const [studyDays, challengeRecords] = await Promise.all([getAllStudyDays(), listChallengeRecords()]);
  const wrap = h("div", {});
  wrap.appendChild(h("h1", { class: "screen-title" }, "Streak"));

  const curStreak = currentStreak(studyDays);
  const longStreak = longestStreak(studyDays);
  const daysStudied = totalDaysStudied(studyDays);
  wrap.appendChild(
    h(
      "div",
      { class: "tiles" },
      tile(curStreak, "Current streak", curStreak > 0 ? "var(--accent)" : null),
      tile(longStreak, "Longest streak", null),
      tile(daysStudied, "Days studied", null)
    )
  );

  const byDay = new Map(studyDays.map((d) => [startOfDay(d.dayStart).getTime(), d]));
  const maxAnswered = Math.max(1, ...studyDays.map((d) => d.answered));

  const card = h("div", { class: "card" });
  card.appendChild(h("div", { class: "section-title" }, "Last 20 weeks"));
  card.appendChild(
    heatmap(byDay, {
      weeks: 20,
      maxAnswered,
      onSelect: (dayMs, rec) => {
        toast(
          rec && rec.answered > 0
            ? `${fmtDateFull(dayMs)}: ${rec.answered} answered, ${rec.correct} correct`
            : `${fmtDateFull(dayMs)}: no study`
        );
      },
    })
  );
  card.appendChild(
    h(
      "div",
      { class: "legend" },
      "Less",
      ...[0, 1, 2, 3, 4].map((l) => h("span", { class: `d ${l ? "l" + l : ""}` })),
      "More"
    )
  );
  wrap.appendChild(card);

  const completed = challengeRecords.filter((r) => r.completedAt);
  const perfect = completed.filter((r) => r.total > 0 && r.bestScore === r.total).length;
  wrap.appendChild(h("div", { class: "section-header" }, "Daily challenges"));
  wrap.appendChild(
    h(
      "div",
      { class: "tiles" },
      tile(challengeStreak(challengeRecords), "Challenge streak", completed.length ? "var(--purple)" : null),
      tile(longestChallengeStreak(challengeRecords), "Longest", completed.length ? "var(--purple)" : null),
      tile(`${perfect}/${completed.length}`, "Perfect runs", perfect ? "var(--green)" : null)
    )
  );

  if (studyDays.length === 0) {
    wrap.appendChild(h("p", { class: "small muted" }, "Finish a session today to start your streak."));
  }
  return wrap;
}

function tile(value, label, color) {
  return h(
    "div",
    { class: "tile" },
    h("div", { class: "v", style: color ? `color:${color}` : "" }, String(value)),
    h("div", { class: "l" }, label)
  );
}
