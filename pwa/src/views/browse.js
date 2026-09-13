import { h, clear, openOverlay } from "../dom.js";
import { getAllQuestionsFlat, getFlagsMap, setFlagState } from "../store.js";

const LETTERS = ["A", "B", "C", "D", "E", "F"];
const RESULT_CAP = 150;

function truncate(s, n) {
  s = s || "";
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}

function haystack(q) {
  return [q.prompt, ...(q.choices || []), q.explanation, q.topic, q.deckName, q.itemTitle]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

// Read-only question card: shows the full prompt/choices/answer/explanation and
// lets you set or clear a flag. Shared by the search and flagged-review overlays.
function questionRow(q, flagsMap, { onFlagChange } = {}) {
  const det = h("details", { class: "disclosure" });
  const flagBadge = h("span", {});
  det.append(
    h("summary", {}, h("span", {}, truncate(q.prompt, 80)), h("span", { class: "spacer" }), flagBadge)
  );
  paintBadge();

  const inner = h("div", { class: "small", style: "padding-top:8px" });
  inner.appendChild(
    h(
      "div",
      { class: "row small muted", style: "gap:8px;flex-wrap:wrap" },
      h("span", {}, q.deckName),
      h("span", {}, q.topic),
      h("span", { class: `badge ${q.difficulty}` }, q.difficulty)
    )
  );
  if (q.context) {
    inner.appendChild(h("p", { class: "muted", style: "margin-top:6px;white-space:pre-wrap" }, q.context));
  }
  inner.appendChild(h("div", { class: "q-prompt", style: "margin-top:8px;font-size:1rem" }, q.prompt));
  (q.choices || []).forEach((c, i) => {
    inner.appendChild(
      h(
        "div",
        { class: `choice ${i === q.correctIndex ? "correct" : ""}`, style: "pointer-events:none;margin-top:6px" },
        h("span", { class: "mk" }, LETTERS[i] || "•"),
        h("span", {}, c)
      )
    );
  });
  if (q.explanation) inner.appendChild(h("div", { class: "fb-exp", style: "margin-top:10px" }, q.explanation));

  const flagRow = h("div", { class: "row", style: "gap:8px;margin-top:12px" });
  for (const [val, label] of [
    ["confusing", "🤔 Confusing"],
    ["wrong", "❌ Wrong"],
  ]) {
    flagRow.appendChild(
      h(
        "button",
        {
          class: `btn ${flagsMap.get(q.id)?.reason === val ? "primary" : ""}`,
          onclick: async (e) => {
            e.preventDefault();
            const next = flagsMap.get(q.id)?.reason === val ? null : val;
            await setFlagState(q, next);
            if (next) flagsMap.set(q.id, { questionId: q.id, deckId: q.deckId, reason: next, createdAt: Date.now() });
            else flagsMap.delete(q.id);
            paintBadge();
            onFlagChange && onFlagChange();
          },
        },
        label
      )
    );
  }
  inner.appendChild(flagRow);
  det.appendChild(inner);
  return det;

  function paintBadge() {
    clear(flagBadge);
    const rec = flagsMap.get(q.id);
    if (rec) {
      flagBadge.appendChild(
        h("span", { class: `badge ${rec.reason === "wrong" ? "hard" : "medium"}` }, rec.reason === "wrong" ? "Wrong" : "Confusing")
      );
    }
  }
}

export async function openBrowse() {
  const [pool, flagsMap] = await Promise.all([getAllQuestionsFlat(), getFlagsMap()]);

  openOverlay((close) => {
    const overlay = h("div", { class: "overlay" });
    const head = h("div", { class: "o-head" });
    const searchWrap = h("div", { style: "padding:0 16px 10px" });
    const body = h("div", { class: "o-body" });
    overlay.append(head, searchWrap, body);

    head.append(h("button", { class: "btn", onclick: close }, "Close"), h("strong", {}, "Search questions"), h("div", { class: "spacer" }));

    const input = h("input", { type: "text", placeholder: `Search ${pool.length} questions…`, oninput: paint });
    searchWrap.appendChild(input);

    const countLine = h("p", { class: "small muted", style: "margin:0 0 6px" });
    const list = h("div", {});
    body.append(countLine, list);

    function paint() {
      const query = input.value.trim().toLowerCase();
      const matches = query ? pool.filter((q) => haystack(q).includes(query)) : pool;
      const shown = matches.slice(0, RESULT_CAP);

      countLine.textContent = query
        ? `${matches.length} match${matches.length === 1 ? "" : "es"}` +
          (matches.length > shown.length ? ` — showing first ${shown.length}` : "")
        : `${pool.length} questions across all decks`;

      clear(list);
      if (shown.length === 0) {
        list.appendChild(h("p", { class: "small muted", style: "padding:24px 0;text-align:center" }, "No matches."));
        return;
      }
      for (const q of shown) list.appendChild(questionRow(q, flagsMap, { onFlagChange: paint }));
    }

    paint();
    return overlay;
  });
}

export async function openFlagged() {
  const [pool, flagsMap] = await Promise.all([getAllQuestionsFlat(), getFlagsMap()]);
  const byId = new Map(pool.map((q) => [q.id, q]));

  openOverlay((close) => {
    const overlay = h("div", { class: "overlay" });
    const head = h("div", { class: "o-head" });
    const body = h("div", { class: "o-body" });
    overlay.append(head, body);
    head.append(h("button", { class: "btn", onclick: close }, "Close"), h("strong", {}, "Flagged questions"), h("div", { class: "spacer" }));

    const list = h("div", {});
    body.appendChild(list);

    function paint() {
      clear(list);
      const ids = [...flagsMap.entries()]
        .filter(([id]) => byId.has(id))
        .sort((a, b) => b[1].createdAt - a[1].createdAt)
        .map(([id]) => id);

      if (ids.length === 0) {
        list.appendChild(
          h(
            "div",
            { class: "empty" },
            h("div", { class: "icon" }, "🚩"),
            h("div", { class: "section-title" }, "No flagged questions"),
            h("p", { class: "small" }, 'While studying, tap the flag icon to mark a question "confusing" or "wrong" — it shows up here.')
          )
        );
        return;
      }
      for (const id of ids) list.appendChild(questionRow(byId.get(id), flagsMap, { onFlagChange: paint }));
    }

    paint();
    return overlay;
  });
}
