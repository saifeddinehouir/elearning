import { h, toast, openOverlay } from "../dom.js";
import {
  listDecks,
  getDeckDetail,
  getDeckPool,
  deleteDeck,
  setDeckIncludeInMix,
  getSettings,
  loadSampleDeck,
} from "../store.js";
import { stageOf } from "../sm2.js";
import { startSession } from "./session.js";
import { openImport } from "./import.js";
import { empty } from "./daily.js";
import { PROMPT_TEMPLATE, copyText } from "../prompt-template.js";

export async function renderDecks() {
  const decks = await listDecks();
  const wrap = h("div", {});
  wrap.appendChild(
    h(
      "div",
      { class: "row between" },
      h("h1", { class: "screen-title" }, "Decks"),
      h("button", { class: "btn primary", onclick: () => openImport() }, "+ Import")
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
    wrap.appendChild(
      h(
        "div",
        { class: "row", style: "justify-content:center;margin-top:10px" },
        h(
          "button",
          {
            class: "btn",
            onclick: async () => {
              const ok = await copyText(PROMPT_TEMPLATE);
              toast(ok ? "Prompt copied — paste it into ChatGPT or Claude" : "Couldn't copy — open Import to copy it manually");
            },
          },
          "📋 Copy the ChatGPT/Claude prompt"
        )
      )
    );
    return wrap;
  }

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
    card.appendChild(
      h(
        "div",
        { class: "row between" },
        h("h3", {}, d.name),
        h("span", { class: "badge accent" }, d.sourceType === "leetcode" ? "LeetCode" : "Course")
      )
    );
    card.appendChild(
      h(
        "div",
        { class: "meta" },
        h("span", {}, `${d.itemCount} items`),
        h("span", {}, `${d.questionCount} questions`),
        d.dueCount > 0 ? h("span", { style: "color:var(--accent)" }, `${d.dueCount} due`) : null
      )
    );
    const prog = h("div", { class: "progress" }, h("i", {}));
    prog.firstChild.style.width = `${Math.round(d.studiedFraction * 100)}%`;
    card.appendChild(prog);
    card.appendChild(h("div", { class: "small muted", style: "margin-top:4px" }, `${Math.round(d.studiedFraction * 100)}% studied`));

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
