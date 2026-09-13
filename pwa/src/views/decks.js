import { h, toast, openOverlay, ICONS } from "../dom.js";
import {
  listDecks,
  getDeckDetail,
  getDeckPool,
  deleteDeck,
  setDeckIncludeInMix,
  getSettings,
  loadSampleDeck,
  exportDeckJSON,
  countFlags,
} from "../store.js";
import { stageOf } from "../sm2.js";
import { startSession } from "./session.js";
import { openImport } from "./import.js";
import { openBrowse, openFlagged } from "./browse.js";
import { empty } from "./daily.js";
import { PROMPT_TEMPLATE, copyText } from "../prompt-template.js";

export async function renderDecks() {
  const [decks, flagCount] = await Promise.all([listDecks(), countFlags()]);
  const wrap = h("div", {});
  wrap.appendChild(
    h(
      "div",
      { class: "row between" },
      h("h1", { class: "screen-title" }, "Decks"),
      h("button", { class: "btn primary", onclick: () => openImport() }, "+ Import")
    )
  );

  // Always available, not just on the empty state — you need this just as much
  // once you already have decks and want to generate another one.
  wrap.appendChild(
    h(
      "div",
      { class: "row", style: "justify-content:center;margin-bottom:14px" },
      h(
        "button",
        {
          class: "btn block",
          onclick: async () => {
            const ok = await copyText(PROMPT_TEMPLATE);
            toast(ok ? "Prompt copied — paste it into ChatGPT or Claude" : "Couldn't copy — open Import to copy it manually");
          },
        },
        "📋 Copy the ChatGPT/Claude prompt"
      )
    )
  );

  if (decks.length === 0) {
    wrap.appendChild(
      empty("🗂", "No decks", "Import a JSON deck, or load a sample to try the app.", {
        label: "Import a deck",
        onclick: () => openImport(),
      })
    );
    wrap.appendChild(
      h(
        "div",
        { class: "row", style: "gap:10px;justify-content:center;flex-wrap:wrap" },
        h("button", { class: "btn", onclick: () => sample("course") }, "Load course sample"),
        h("button", { class: "btn", onclick: () => sample("leetcode") }, "Load LeetCode sample")
      )
    );
    return wrap;
  }

  wrap.appendChild(
    h(
      "div",
      { class: "row", style: "gap:10px;margin-bottom:14px" },
      h(
        "button",
        { class: "btn block", onclick: () => openBrowse() },
        h("span", { html: ICONS.search, style: "width:16px;height:16px;display:inline-flex" }),
        "Search questions"
      ),
      h(
        "button",
        { class: "btn block", onclick: () => openFlagged() },
        h("span", { html: ICONS.flag, style: "width:16px;height:16px;display:inline-flex" }),
        flagCount > 0 ? `Flagged (${flagCount})` : "Flagged"
      )
    )
  );

  for (const d of decks) {
    const card = h("div", {
      class: "card deck",
      role: "button",
      tabindex: "0",
      onclick: () => openDeckDetail(d.id),
      onkeydown: (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openDeckDetail(d.id);
        }
      },
    });
    const isLeetcode = d.sourceType === "leetcode";
    card.appendChild(
      h(
        "div",
        { class: "row", style: "align-items:flex-start" },
        h("span", { class: `icon-chip ${isLeetcode ? "c-purple" : "c-accent"}`, html: isLeetcode ? ICONS.code : ICONS.book }),
        h(
          "div",
          { class: "spacer" },
          h("h3", {}, d.name),
          h(
            "div",
            { class: "meta" },
            h("span", {}, `${d.itemCount} items`),
            h("span", {}, `${d.questionCount} questions`),
            d.dueCount > 0 ? h("span", { style: "color:var(--accent);font-weight:600" }, `${d.dueCount} due`) : null
          )
        ),
        h("span", { class: "chevron", html: ICONS.chevron, style: "width:16px;height:16px;margin-top:6px" })
      )
    );
    const prog = h("div", { class: "progress" }, h("i", {}));
    prog.firstChild.style.width = `${Math.round(d.studiedFraction * 100)}%`;
    card.appendChild(prog);
    card.appendChild(h("div", { class: "small muted", style: "margin-top:6px" }, `${Math.round(d.studiedFraction * 100)}% studied`));

    const sw = h("label", { class: "switch", onclick: (e) => e.stopPropagation() });
    const cb = h("input", {
      type: "checkbox",
      checked: d.includeInMix !== false,
      onchange: (e) => setDeckIncludeInMix(d.id, e.target.checked),
    });
    sw.append(h("span", { class: "small" }, "Include in daily mix"), cb);
    card.appendChild(sw);

    wrap.appendChild(card);
  }
  return wrap;

  async function sample(kind) {
    const r = await loadSampleDeck(kind);
    toast(`Loaded ${r.deck.name}`);
  }
}

async function openDeckDetail(deckId) {
  const detail = await getDeckDetail(deckId);
  if (!detail) return;
  const { deck, items } = detail;
  const settings = getSettings();

  openOverlay((close) => {
    const overlay = h("div", { class: "overlay" });
    const head = h("div", { class: "o-head" });
    const body = h("div", { class: "o-body" });
    overlay.append(head, body);

    head.append(
      h("button", { class: "btn", onclick: close }, "Back"),
      h("strong", {}, deck.name),
      h("div", { class: "spacer" })
    );

    const totalQ = items.reduce((s, i) => s + i.questions.length, 0);

    body.appendChild(
      h(
        "div",
        { class: "card" },
        h(
          "button",
          {
            class: "btn primary block",
            disabled: totalQ === 0,
            onclick: async () => {
              const pool = await getDeckPool(deckId);
              close();
              startSession(pool, { size: settings.dailyGoal, newLimitRatio: settings.newLimitRatio });
            },
          },
          "Study this deck only"
        ),
        h(
          "div",
          { class: "meta mt" },
          h("span", {}, deck.sourceType === "leetcode" ? "LeetCode" : "Course"),
          h("span", {}, `${items.length} items`),
          h("span", {}, `${totalQ} questions`)
        ),
        h(
          "button",
          {
            class: "btn block mt",
            disabled: totalQ === 0,
            onclick: async () => {
              const json = await exportDeckJSON(deckId);
              const ok = await copyText(json);
              toast(ok ? "Deck JSON copied — paste it anywhere to back it up or re-import" : "Couldn't copy — check clipboard permissions");
            },
          },
          "📋 Export JSON"
        ),
        h(
          "button",
          {
            class: "btn danger block mt",
            onclick: async () => {
              if (confirm(`Delete "${deck.name}" and its history? Your streak is kept.`)) {
                await deleteDeck(deckId);
                close();
                toast("Deck deleted");
              }
            },
          },
          "Delete deck"
        )
      )
    );

    const list = h("div", { class: "card" });
    list.appendChild(h("div", { class: "section-title" }, "Items"));
    for (const it of items) {
      const det = h("details", { class: "disclosure" });
      det.appendChild(
        h(
          "summary",
          {},
          h("span", {}, it.title),
          h("span", { class: "spacer" }),
          h("span", { class: `badge ${it.difficulty}` }, it.difficulty)
        )
      );
      const inner = h("div", { class: "small", style: "padding-top:8px" });
      inner.appendChild(h("div", { class: "muted" }, it.topic));
      if (it.context) inner.appendChild(h("p", { class: "muted", style: "margin-top:6px;white-space:pre-wrap" }, it.context));
      for (const q of it.questions) {
        inner.appendChild(
          h(
            "div",
            { style: "margin-top:8px" },
            h("span", { class: "badge" }, stageOf(q.reviewState)),
            " ",
            h("span", {}, q.prompt)
          )
        );
      }
      det.appendChild(inner);
      list.appendChild(det);
    }
    body.appendChild(list);
    return overlay;
  });
}
