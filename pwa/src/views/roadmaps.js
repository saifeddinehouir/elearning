import { h, clear, toast, openOverlay, ICONS } from "../dom.js";
import {
  listDecks,
  listRoadmaps,
  installPatternPath,
  attachDeckToNode,
  deleteRoadmap,
  renameRoadmap,
  updateRoadmapNode,
  addRoadmapNode,
  removeRoadmapNode,
  moveRoadmapNode,
} from "../store.js";
import { openImport } from "./import.js";
import { openDeckDetail } from "./decks.js";
import { empty } from "./daily.js";
import { ROADMAP_PROMPT_TEMPLATE, copyText } from "../prompt-template.js";
import { PATHS, PATTERN_PATH, pathByKey, isStageDone, MASTERY } from "../patterns.js";
import { openCheatSheet } from "./guide.js";
import { ring } from "../charts.js";
import { LIBRARIES, libraryByKey } from "../library.js";
import { installLibrary } from "../store.js";

// Installs (or repairs) a built-in deck library and opens its roadmap.
export async function installAndOpenLibrary(key) {
  const lib = libraryByKey.get(typeof key === "string" ? key : LIBRARIES[0].key);
  toast(`Adding ${lib.name}…`);
  const roadmap = await installLibrary(lib.key);
  toast(`${lib.name}: ${lib.deckCount} decks added to your daily mix`);
  openRoadmapDetail(roadmap.id);
}

// Promo shown until a library is installed.
export function libraryPromoCard(lib = LIBRARIES[0]) {
  return h(
    "div",
    { class: "card promo" },
    h("div", { class: "kicker" }, "Built-in library"),
    h("div", { class: "promo-title" }, lib.name),
    h("p", { class: "small muted", style: "margin:4px 0 12px" }, lib.blurb),
    h(
      "div",
      { class: "meta", style: "margin:0 0 12px" },
      h("span", {}, `${lib.deckCount} decks`),
      h("span", {}, `${lib.questionCount} questions`),
      h("span", {}, "all open")
    ),
    h("button", { class: "btn primary block", onclick: () => installAndOpenLibrary(lib.key) }, `Add ${lib.name}`)
  );
}

// The unlock rule a roadmap's stages are judged by ("seen" for your own roadmaps).
const ruleOf = (roadmap) => (roadmap?.builtin && pathByKey.get(roadmap.builtin)?.unlock) || "seen";
const toneOf = (roadmap) => (roadmap?.builtin && pathByKey.get(roadmap.builtin)?.tone) || null;
export const pathClass = (tone) => (tone ? ` builtin-path${tone === "hard" ? " hard" : ""}` : "");

// Installs (or repairs) a built-in path and opens it. Safe as a click handler:
// a non-string argument (the click event) means the core path.
export async function installAndOpenPath(key) {
  const path = pathByKey.get(typeof key === "string" ? key : PATTERN_PATH.key);
  const roadmap = await installPatternPath(path.key);
  toast(`${path.name} ready — stage 1 is in your daily mix`);
  openRoadmapDetail(roadmap.id);
}

// Promo shown until a built-in path is installed.
export function pathPromoCard(path = PATHS[0], { compact = false } = {}) {
  const questions = path.patterns.reduce((n, p) => n + p.problems.length * 2, 0);
  const hard = path.tone === "hard";
  return h(
    "div",
    { class: `card promo${pathClass(path.tone)}` },
    h("div", { class: "kicker" }, hard ? "Built-in path · challenging" : "Built-in path"),
    h("div", { class: "promo-title" }, path.name),
    h("p", { class: "small muted", style: "margin:4px 0 12px" }, path.blurb),
    compact
      ? null
      : h(
          "div",
          { class: "promo-chips" },
          ...path.patterns.slice(0, 6).map((p) => h("span", { class: "chip" }, p.name)),
          h("span", { class: "chip faint" }, `+${path.patterns.length - 6} more`)
        ),
    h(
      "div",
      { class: "meta", style: "margin:12px 0" },
      h("span", {}, `${path.patterns.length} stages`),
      h("span", {}, `${questions} questions`),
      h("span", {}, path.unlock === "mastery" ? `unlock at ${Math.round(MASTERY * 100)}% mastery` : "unlocks as you go")
    ),
    h(
      "div",
      { class: "row", style: "gap:10px" },
      h("button", { class: `btn ${hard ? "hard-btn" : "primary"} block`, onclick: () => installAndOpenPath(path.key) }, hard ? "Take the challenge" : "Start the path"),
      h("button", { class: "btn", onclick: () => openCheatSheet(path.key) }, "Cheat sheet")
    )
  );
}

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

  for (const lib of LIBRARIES) {
    if (!roadmaps.some((r) => r.builtin === lib.key)) wrap.appendChild(libraryPromoCard(lib));
  }
  for (const path of PATHS) {
    if (!roadmaps.some((r) => r.builtin === path.key)) wrap.appendChild(pathPromoCard(path));
  }

  if (roadmaps.length === 0 && decks.length === 0) {
    wrap.appendChild(
      empty("", "Or plan your own", "Copy the roadmap prompt below, plan a curriculum with ChatGPT or Claude, and import the result.")
    );
  } else {
    wrap.appendChild(roadmaps.length > 0 ? roadmapsSection(roadmaps, decks) : fallbackPathCard(decks));
  }

  wrap.appendChild(
    h(
      "button",
      {
        class: "btn block subtle mt",
        onclick: async () => {
          const ok = await copyText(ROADMAP_PROMPT_TEMPLATE);
          toast(ok ? "Prompt copied — paste it into ChatGPT or Claude" : "Couldn't copy — open Import to copy it manually");
        },
      },
      h("span", { html: ICONS.sparkle }),
      "Copy the roadmap prompt for your own path"
    )
  );
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

  const rule = ruleOf(roadmap);
  const isDone = (deck) => isStageDone(deck, rule);
  const activeIdx = entries.findIndex((e) => !isDone(e.deck));
  const path = h("div", { class: "roadmap" });
  entries.forEach((entry, i) => {
    // Built-in paths unlock in order. Locked stages stay tappable so you can
    // study ahead; they just aren't in the daily mix yet.
    const locked = !!(roadmap?.builtin && entry.node && !entry.node.unlocked);
    const el = pathNode(entry, i === activeIdx, locked, i);
    if (isDone(entry.deck)) el.classList.add("is-done");
    if (locked) el.classList.add("locked");
    path.appendChild(el);
  });
  return path;

  function pathNode(entry, isActive, locked, index) {
    const num = String(index + 1).padStart(2, "0");
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
        h("div", { class: `roadmap-dot unattached${isActive ? " active" : ""}` }, num),
        h(
          "div",
          { class: "spacer roadmap-text" },
          h("div", { class: "roadmap-name" }, entry.title),
          h("div", { class: "small muted roadmap-sub" }, entry.subtitle || "Tap to attach a deck"),
          entry.subtitle ? h("div", { class: "small roadmap-attach" }, "Tap to attach a deck") : null
        ),
        h("span", { class: "chevron", html: ICONS.chevron })
      );
    }

    const pct = Math.round(deck.studiedFraction * 100);
    const done = isDone(deck);
    const status = done ? "done" : isActive ? "active" : "todo";
    const inner = locked ? h("span", { html: ICONS.lock }) : num;
    const meter = done || locked ? null : h("div", { class: "stage-meter" }, h("i", { style: `width:${pct}%` }));

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
      h("div", { class: `roadmap-dot ${status}`, "aria-label": `Stage ${num}` }, inner),
      h(
        "div",
        { class: "spacer roadmap-text" },
        h("div", { class: "roadmap-name" }, entry.title),
        entry.subtitle ? h("div", { class: "small muted roadmap-sub" }, entry.subtitle) : null,
        h(
          "div",
          { class: "row small muted", style: "gap:8px;margin-top:4px;flex-wrap:wrap" },
          h("span", {}, `${deck.questionCount} questions`),
          deck.dueCount > 0 ? h("span", { style: "color:var(--accent);font-weight:600" }, `${deck.dueCount} due`) : null,
          rule === "mastery" && deck.studiedFraction > 0
            ? h(
                "span",
                { class: `mastery${deck.mastery >= MASTERY ? " ok" : ""}` },
                `${Math.round(deck.mastery * 100)}% mastery${deck.mastery >= MASTERY ? "" : ` · need ${Math.round(MASTERY * 100)}%`}`
              )
            : null,
          done ? h("span", { class: "badge" }, "Done") : locked ? h("span", { class: "badge" }, "Locked") : isActive ? h("span", { class: "badge accent" }, "Up next") : pct > 0 ? h("span", {}, `${pct}% seen`) : null
        ),
        meter
      ),
      h("span", { class: "chevron", html: ICONS.chevron })
    );
  }
}

// Shown when you haven't authored a roadmap yet: one stop per deck, in
// import order. Copying/importing the roadmap prompt replaces this with the
// "Roadmaps" section below instead.
function fallbackPathCard(decks) {
  const card = h("div", { class: "card" });
  card.appendChild(h("div", { class: "section-title" }, "Your decks as a path"));
  card.appendChild(renderPathNodes(decks, null));
  card.appendChild(
    h(
      "p",
      { class: "small muted", style: "margin-top:10px" },
      "This order is just your import history. Copy the roadmap prompt below for a named, structured path instead."
    )
  );
  return card;
}

// One summary row per imported roadmap, with an overall progress bar, so you
// can see how far along each one is at a glance and pick which to open.
function roadmapsSection(roadmaps, decks) {
  const deckById = new Map(decks.map((d) => [d.id, d]));
  const wrap = h("div", {});
  wrap.appendChild(h("div", { class: "section-header" }, "Your paths"));

  // Built-in path first, then newest.
  const ordered = [...roadmaps].sort((a, b) => (b.builtin ? 1 : 0) - (a.builtin ? 1 : 0) || b.createdAt - a.createdAt);
  for (const rm of ordered) {
    const total = rm.nodes.length;
    const isDone = (deck) => isStageDone(deck, ruleOf(rm));
    const done = rm.nodes.filter((n) => isDone(n.deckId ? deckById.get(n.deckId) : null)).length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const next = rm.nodes.find((n) => !isDone(n.deckId ? deckById.get(n.deckId) : null));

    const card = h("div", {
      class: `card deck${pathClass(toneOf(rm))}`,
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
        h("span", { class: `icon-chip ${toneOf(rm) === "hard" ? "c-red" : rm.builtin ? "c-purple" : "c-teal"}`, html: rm.builtin ? ICONS.code : ICONS.map }),
        h(
          "div",
          { class: "spacer" },
          h("h3", {}, rm.name),
          h(
            "div",
            { class: "meta" },
            h("span", {}, `${done}/${total} stage${total === 1 ? "" : "s"}`),
            next ? h("span", { style: "color:var(--accent);font-weight:600" }, `Next: ${next.title}`) : h("span", {}, "Finished")
          )
        ),
        h("span", { class: "chevron", html: ICONS.chevron, style: "margin-top:6px" })
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

// Full-screen view of one roadmap's path, with a toggleable edit mode for
// renaming the roadmap, reordering/renaming/removing nodes, and adding new
// ones — all without needing to regenerate and re-import the whole roadmap
// JSON for a small tweak. Takes an id (rather than the roadmap/decks objects)
// so it can reopen itself after an attach — the attach picker replaces this
// overlay (only one is ever on screen at a time), so there's nothing left to
// repaint in place once it closes. Every other mutation here (rename, reorder,
// add/remove/edit a node) stays inside this same overlay and repaints in place.
export function openRoadmapDetail(roadmapId) {
  openOverlay((close) => {
    const overlay = h("div", { class: "overlay" });
    const head = h("div", { class: "o-head" });
    const body = h("div", { class: "o-body" });
    overlay.append(head, body);
    const titleEl = h("strong", { class: "o-title-text" }, "");
    const editBtn = h("button", { class: "btn", onclick: () => { editMode = !editMode; paint(); } }, "Edit");
    head.append(h("button", { class: "btn", onclick: close }, "Back"), titleEl, h("div", { class: "spacer" }), editBtn);

    let editMode = false;
    let roadmap = null;
    let decks = [];

    async function refresh() {
      const [freshDecks, roadmaps] = await Promise.all([listDecks(), listRoadmaps()]);
      const freshRoadmap = roadmaps.find((r) => r.id === roadmapId);
      if (!freshRoadmap) {
        close();
        return;
      }
      roadmap = freshRoadmap;
      decks = freshDecks;
      paint();
    }

    function paint() {
      titleEl.textContent = roadmap.name;
      editBtn.textContent = editMode ? "Done" : "Edit";
      clear(body);

      if (editMode) {
        body.appendChild(editForm());
      } else {
        body.appendChild(detailHeader());
        const card = h("div", { class: "card" });
        // The picker replaced this overlay, so reopen rather than repaint a detached node.
        card.appendChild(renderPathNodes(decks, roadmap, { onAttached: () => openRoadmapDetail(roadmapId) }));
        body.appendChild(card);
      }

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
    }

    function detailHeader() {
      const deckById = new Map(decks.map((d) => [d.id, d]));
      const rule = ruleOf(roadmap);
      const tone = toneOf(roadmap);
      const total = roadmap.nodes.length;
      const done = roadmap.nodes.filter((n) => isStageDone(n.deckId ? deckById.get(n.deckId) : null, rule)).length;
      const questions = roadmap.nodes.reduce((s, n) => s + (deckById.get(n.deckId)?.questionCount || 0), 0);
      const frac = total ? done / total : 0;
      const lib = libraryByKey.get(roadmap.builtin);
      const how = lib
        ? `All ${roadmap.nodes.length} decks are in your daily mix. This is a suggested order; study them in any order.`
        : rule === "mastery"
          ? `A stage opens once you've seen every question in the one before it and got at least ${Math.round(MASTERY * 100)}% right on your latest try. Locked stages can still be studied on their own.`
          : "A stage joins your daily mix once you've seen every question in the stage before it. You can still study locked stages on their own.";
      return h(
        "div",
        { class: `card${pathClass(tone)}` },
        h(
          "div",
          { class: "row", style: "gap:16px;align-items:center" },
          ring(frac, {
            size: 96,
            color: tone === "hard" ? "var(--bad)" : "var(--ink)",
            label: String(done).padStart(2, "0"),
            unit: `/${total}`,
            sub: "Stages done",
          }),
          h(
            "div",
            { class: "spacer" },
            h("div", { class: "kicker" }, lib ? "Built-in library" : tone === "hard" ? "Built-in path · challenging" : roadmap.builtin ? "Built-in path" : "Your roadmap"),
            h("div", { class: "promo-title" }, roadmap.name),
            h(
              "div",
              { class: "meta", style: "margin:4px 0 0" },
              h("span", {}, `${done}/${total} stages complete`),
              h("span", {}, `${questions} questions`)
            )
          )
        ),
        roadmap.builtin ? h("p", { class: "small muted", style: "margin-top:12px" }, how) : null,
        roadmap.builtin && !lib
          ? h("button", { class: "btn block mt", onclick: () => openCheatSheet(roadmap.builtin) }, h("span", { html: ICONS.list }), "Pattern cheat sheet")
          : null
      );
    }

    function editForm() {
      const wrap = h("div", {});

      const nameCard = h("div", { class: "card tight" });
      nameCard.appendChild(h("label", { class: "field", style: "margin-bottom:0" },
        h("span", {}, "Roadmap name"),
        h("input", {
          type: "text",
          value: roadmap.name,
          onchange: async (e) => {
            const name = e.target.value.trim();
            if (name && name !== roadmap.name) await renameRoadmap(roadmap.id, name);
            await refresh();
          },
        })
      ));
      wrap.appendChild(nameCard);

      wrap.appendChild(h("div", { class: "section-header" }, "Stages"));
      roadmap.nodes.forEach((node, i) => wrap.appendChild(editableNodeCard(node, i)));

      wrap.appendChild(
        h(
          "button",
          {
            class: "btn block mt",
            onclick: async () => {
              await addRoadmapNode(roadmap.id, "New stage");
              await refresh();
            },
          },
          "+ Add a stage"
        )
      );
      return wrap;
    }

    function editableNodeCard(node, index) {
      const card = h("div", { class: "card tight", style: "margin-bottom:10px" });

      const upBtn = h("button", {
        class: "btn icon-btn",
        disabled: index === 0,
        "aria-label": "Move up",
        html: ICONS.up,
        onclick: async () => { await moveRoadmapNode(roadmap.id, node.id, -1); await refresh(); },
      });
      const downBtn = h("button", {
        class: "btn icon-btn",
        disabled: index === roadmap.nodes.length - 1,
        "aria-label": "Move down",
        html: ICONS.down,
        onclick: async () => { await moveRoadmapNode(roadmap.id, node.id, 1); await refresh(); },
      });
      const removeBtn = h("button", {
        class: "btn icon-btn",
        style: "color:var(--red)",
        "aria-label": "Remove stage",
        html: ICONS.trash,
        onclick: async () => {
          if (confirm(`Remove "${node.title}" from this roadmap? Its attached deck (if any) is kept.`)) {
            await removeRoadmapNode(roadmap.id, node.id);
            await refresh();
          }
        },
      });

      card.append(
        h("div", { class: "row", style: "gap:6px" }, h("span", { class: "cheat-num" }, String(index + 1).padStart(2, "0")), upBtn, downBtn, h("div", { class: "spacer" }), removeBtn),
        h("input", {
          type: "text",
          value: node.title,
          style: "margin-top:10px;font-weight:700",
          onchange: async (e) => {
            const title = e.target.value.trim();
            if (title && title !== node.title) await updateRoadmapNode(roadmap.id, node.id, { title });
            await refresh();
          },
        }),
        h("input", {
          type: "text",
          value: node.description,
          placeholder: "Description (optional)",
          style: "margin-top:8px",
          onchange: async (e) => {
            const description = e.target.value.trim();
            if (description !== node.description) await updateRoadmapNode(roadmap.id, node.id, { description });
            await refresh();
          },
        })
      );
      return card;
    }

    refresh();
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
          "",
          "No decks yet",
          `Generate a deck for "${node.title}" with the deck prompt, import it, then come back here to attach it.`,
          { label: "Import a deck", onclick: () => openImport() }
        )
      );
    } else {
      const list = h("div", { class: "list" });
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
