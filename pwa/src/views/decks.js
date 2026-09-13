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
  listRoadmaps,
  attachDeckToNode,
  deleteRoadmap,
} from "../store.js";
import { stageOf } from "../sm2.js";
import { startSession } from "./session.js";
import { openImport } from "./import.js";
import { openBrowse, openFlagged } from "./browse.js";
import { empty } from "./daily.js";
import { PROMPT_TEMPLATE, ROADMAP_PROMPT_TEMPLATE, copyText } from "../prompt-template.js";

export async function renderDecks() {
  const [decks, flagCount, roadmaps] = await Promise.all([listDecks(), countFlags(), listRoadmaps()]);
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
  // once you already have decks/a roadmap and want to generate another one.
  wrap.appendChild(
    h(
      "div",
      { class: "row", style: "gap:10px;margin-bottom:14px;flex-wrap:wrap" },
      h(
        "button",
        {
          class: "btn block",
          onclick: async () => {
            const ok = await copyText(PROMPT_TEMPLATE);
            toast(ok ? "Prompt copied — paste it into ChatGPT or Claude" : "Couldn't copy — open Import to copy it manually");
          },
        },
        "📋 Copy the deck prompt"
      ),
      h(
        "button",
        {
          class: "btn block",
          onclick: async () => {
            const ok = await copyText(ROADMAP_PROMPT_TEMPLATE);
            toast(ok ? "Prompt copied — paste it into ChatGPT or Claude" : "Couldn't copy — open Import to copy it manually");
          },
        },
        "🗺️ Copy the roadmap prompt"
      )
    )
  );

  if (decks.length === 0 && roadmaps.length === 0) {
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

  wrap.appendChild(roadmaps.length > 0 ? roadmapsSection(roadmaps, decks) : fallbackPathCard(decks));

  if (decks.length === 0) return wrap;

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

  wrap.appendChild(h("div", { class: "section-header" }, "All decks"));
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

// Builds the node list only (the connected dots + rows) — shared by the
// inline fallback card and the full-screen roadmap detail view. `roadmap` is
// null for the deck-derived fallback, where every entry already has a deck
// and the "unattached" branch below never runs. `onAttached` is only needed
// when this is rendered inside an overlay that must repaint itself after an
// attach (the Decks tab repaints on its own via the normal store→render loop).
function renderPathNodes(decks, roadmap, { onAttached } = {}) {
  const deckById = new Map(decks.map((d) => [d.id, d]));
  const entries = roadmap
    ? roadmap.nodes.map((node) => ({ title: node.title, subtitle: node.description, node, deck: node.deckId ? deckById.get(node.deckId) : null }))
    : [...decks]
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((d) => ({ title: d.name, subtitle: null, node: null, deck: d }));

  const activeIdx = entries.findIndex((e) => !(e.deck && e.deck.studiedFraction >= 0.999));
  const path = h("div", { class: "roadmap" });
  entries.forEach((entry, i) => path.appendChild(pathNode(entry, i === activeIdx)));
  return path;

  function pathNode(entry, isActive) {
    const { deck, node } = entry;

    if (!deck) {
      return h(
        "div",
        {
          class: "roadmap-node",
          role: "button",
          tabindex: "0",
          onclick: () => openAttachDeckPicker(roadmap, node, decks, onAttached),
          onkeydown: (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openAttachDeckPicker(roadmap, node, decks, onAttached);
            }
          },
        },
        h("div", { class: `roadmap-dot unattached${isActive ? " active" : ""}` }, h("div", { class: "roadmap-dot-inner" }, "+")),
        h(
          "div",
          { class: "spacer" },
          h("div", { class: "roadmap-name" }, entry.title),
          h("div", { class: "small muted", style: "margin-top:2px" }, entry.subtitle || "Tap to attach a deck")
        ),
        h("span", { class: "chevron", html: ICONS.chevron, style: "width:16px;height:16px" })
      );
    }

    const pct = Math.round(deck.studiedFraction * 100);
    const done = pct >= 100;
    const status = done ? "done" : isActive ? "active" : "todo";
    const ringColor = done ? "var(--green)" : "var(--accent)";

    return h(
      "div",
      {
        class: "roadmap-node",
        role: "button",
        tabindex: "0",
        onclick: () => openDeckDetail(deck.id),
        onkeydown: (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openDeckDetail(deck.id);
          }
        },
      },
      h(
        "div",
        { class: `roadmap-dot ${status}`, style: `background: conic-gradient(${ringColor} ${pct}%, var(--surface-3) 0)` },
        h("div", { class: "roadmap-dot-inner" }, done ? "✓" : String(pct))
      ),
      h(
        "div",
        { class: "spacer" },
        h("div", { class: "roadmap-name" }, entry.title),
        h(
          "div",
          { class: "row small muted", style: "gap:8px;margin-top:2px" },
          h("span", {}, `${deck.questionCount} questions`),
          deck.dueCount > 0 ? h("span", { style: "color:var(--accent);font-weight:600" }, `${deck.dueCount} due`) : null
        )
      ),
      h("span", { class: "chevron", html: ICONS.chevron, style: "width:16px;height:16px" })
    );
  }
}

// Shown when you haven't authored a roadmap yet: one stop per deck, in
// import order. Copying/importing the roadmap prompt replaces this with the
// "Roadmaps" section below instead.
function fallbackPathCard(decks) {
  const card = h("div", { class: "card" });
  card.appendChild(h("div", { class: "section-title" }, "Your path"));
  card.appendChild(renderPathNodes(decks, null));
  card.appendChild(
    h(
      "p",
      { class: "small muted", style: "margin-top:10px" },
      "This order is just your import history. Copy the roadmap prompt above for a named, structured path instead."
    )
  );
  return card;
}

// One summary row per imported roadmap, with an overall progress bar, so you
// can see how far along each one is at a glance and pick which to open —
// this is the "see the advancement" list once you have more than a bare
// deck-derived path.
function roadmapsSection(roadmaps, decks) {
  const deckById = new Map(decks.map((d) => [d.id, d]));
  const wrap = h("div", {});
  wrap.appendChild(h("div", { class: "section-header" }, "Roadmaps"));

  for (const rm of roadmaps) {
    const total = rm.nodes.length;
    const done = rm.nodes.filter((n) => {
      const d = n.deckId ? deckById.get(n.deckId) : null;
      return d && d.studiedFraction >= 0.999;
    }).length;
    const pct = total ? Math.round((done / total) * 100) : 0;

    const card = h("div", {
      class: "card deck",
      role: "button",
      tabindex: "0",
      onclick: () => openRoadmapDetail(rm.id),
      onkeydown: (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openRoadmapDetail(rm.id);
        }
      },
    });
    card.appendChild(
      h(
        "div",
        { class: "row", style: "align-items:flex-start" },
        h("span", { class: "icon-chip c-teal", html: ICONS.map }),
        h(
          "div",
          { class: "spacer" },
          h("h3", {}, rm.name),
          h("div", { class: "meta" }, h("span", {}, `${total} stage${total === 1 ? "" : "s"}`), h("span", {}, `${done}/${total} complete`))
        ),
        h("span", { class: "chevron", html: ICONS.chevron, style: "width:16px;height:16px;margin-top:6px" })
      )
    );
    const prog = h("div", { class: "progress" }, h("i", {}));
    prog.firstChild.style.width = `${pct}%`;
    card.appendChild(prog);
    card.appendChild(h("div", { class: "small muted", style: "margin-top:6px" }, `${pct}% complete`));

    wrap.appendChild(card);
  }
  return wrap;
}

// Full-screen view of one roadmap's path. Re-fetches by id (rather than
// taking the roadmap/decks objects directly) so it can cleanly reopen itself
// after an attach — opening the attach picker replaces this overlay (only
// one is ever on screen at a time), so there's no element left to repaint in
// place once it closes.
function openRoadmapDetail(roadmapId) {
  openOverlay((close) => {
    const overlay = h("div", { class: "overlay" });
    const head = h("div", { class: "o-head" });
    const body = h("div", { class: "o-body" });
    overlay.append(head, body);
    const titleEl = h("strong", {}, "");
    head.append(h("button", { class: "btn", onclick: close }, "Back"), titleEl, h("div", { class: "spacer" }));

    (async () => {
      const [decks, roadmaps] = await Promise.all([listDecks(), listRoadmaps()]);
      const roadmap = roadmaps.find((r) => r.id === roadmapId);
      if (!roadmap) {
        close();
        return;
      }
      titleEl.textContent = roadmap.name;

      const card = h("div", { class: "card" });
      card.appendChild(renderPathNodes(decks, roadmap, { onAttached: () => openRoadmapDetail(roadmapId) }));
      body.appendChild(card);

      body.appendChild(
        h(
          "button",
          {
            class: "btn danger block mt",
            onclick: async () => {
              if (confirm(`Delete the "${roadmap.name}" roadmap? Attached decks are kept — this only removes this path layout.`)) {
                await deleteRoadmap(roadmap.id);
                close();
              }
            },
          },
          "Delete this roadmap"
        )
      );
    })();

    return overlay;
  });
}

function openAttachDeckPicker(roadmap, node, decks, onAttached) {
  openOverlay((close) => {
    const overlay = h("div", { class: "overlay" });
    const head = h("div", { class: "o-head" });
    const body = h("div", { class: "o-body" });
    overlay.append(head, body);
    head.append(
      h("button", { class: "btn", onclick: close }, "Cancel"),
      h("strong", {}, `Attach a deck`),
      h("div", { class: "spacer" })
    );

    body.appendChild(h("p", { class: "small muted", style: "margin-bottom:12px" }, `For the "${node.title}" stage of your roadmap.`));

    if (decks.length === 0) {
      body.appendChild(
        empty(
          "🗂",
          "No decks yet",
          `Generate a deck for "${node.title}" with the deck prompt, import it, then come back here to attach it.`,
          { label: "Import a deck", onclick: () => openImport() }
        )
      );
    } else {
      const list = h("div", { class: "card tight" });
      for (const d of decks) {
        list.appendChild(
          h(
            "button",
            {
              class: "list-row tappable",
              style: "width:100%;text-align:left",
              onclick: async () => {
                await attachDeckToNode(roadmap.id, node.id, d.id);
                toast(`Attached "${d.name}"`);
                close();
                onAttached && onAttached();
              },
            },
            h("span", { class: "label" }, d.name),
            h("span", { class: "value" }, `${d.questionCount} questions`)
          )
        );
      }
      body.appendChild(list);
    }
    return overlay;
  });
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
