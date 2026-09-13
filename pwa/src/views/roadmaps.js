import { h, toast, openOverlay, ICONS } from "../dom.js";
import { listDecks, listRoadmaps, attachDeckToNode, deleteRoadmap } from "../store.js";
import { openImport } from "./import.js";
import { openDeckDetail } from "./decks.js";
import { empty } from "./daily.js";
import { ROADMAP_PROMPT_TEMPLATE, copyText } from "../prompt-template.js";

export async function renderRoadmaps() {
  const [decks, roadmaps] = await Promise.all([listDecks(), listRoadmaps()]);
  const wrap = h("div", {});
  wrap.appendChild(
    h(
      "div",
      { class: "row between" },
      h("h1", { class: "screen-title" }, "Roadmaps"),
      h("button", { class: "btn primary", onclick: () => openImport() }, "+ Import")
    )
  );

  wrap.appendChild(
    h(
      "div",
      { class: "row", style: "justify-content:center;margin-bottom:14px" },
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

  if (roadmaps.length === 0 && decks.length === 0) {
    wrap.appendChild(
      empty(
        "🗺️",
        "No roadmaps yet",
        "Copy the prompt above, plan a curriculum with ChatGPT or Claude, and import the result — or import a deck first and a simple path builds itself.",
        { label: "Import", onclick: () => openImport() }
      )
    );
    return wrap;
  }

  wrap.appendChild(roadmaps.length > 0 ? roadmapsSection(roadmaps, decks) : fallbackPathCard(decks));
  return wrap;
}

// Builds the node list only (the connected dots + rows) — shared by the
// inline fallback card and the full-screen roadmap detail view. `roadmap` is
// null for the deck-derived fallback, where every entry already has a deck
// and the "unattached" branch below never runs. `onAttached` is only needed
// when this is rendered inside an overlay that must repaint itself after an
// attach (the tab repaints on its own via the normal store→render loop).
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
// can see how far along each one is at a glance and pick which to open.
function roadmapsSection(roadmaps, decks) {
  const deckById = new Map(decks.map((d) => [d.id, d]));
  const wrap = h("div", {});
  wrap.appendChild(h("div", { class: "section-header" }, "All roadmaps"));

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
