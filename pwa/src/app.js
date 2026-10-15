import { h, clear, closeOverlay, ICONS } from "./dom.js";
import { onChange, getSettings, requestPersistentStorage, renameBuiltinPaths } from "./store.js";
import { registerServiceWorker, startNudgeWatcher } from "./notifications.js";
import { watchForUpdates } from "./updates.js";

import { renderDaily } from "./views/daily.js";
import { renderStats } from "./views/stats.js";
import { renderStreak } from "./views/streak.js";
import { renderDecks } from "./views/decks.js";
import { renderRoadmaps } from "./views/roadmaps.js";

const TABS = [
  { id: "today", label: "Today", icon: ICONS.today, render: renderDaily },
  { id: "stats", label: "Stats", icon: ICONS.stats, render: renderStats },
  { id: "streak", label: "Streak", icon: ICONS.streak, render: renderStreak },
  { id: "decks", label: "Decks", icon: ICONS.decks, render: renderDecks },
  { id: "roadmaps", label: "Roadmaps", icon: ICONS.map, render: renderRoadmaps },
];

const appRoot = document.getElementById("app");
let current = tabFromHash();

function applyTheme() {
  const { theme } = getSettings();
  if (theme === "light" || theme === "dark") {
    document.documentElement.dataset.theme = theme;
  } else {
    delete document.documentElement.dataset.theme;
  }
  // Match the browser / status bar to the page background.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#f4f3ef";
}
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", applyTheme);

function tabFromHash() {
  const id = (location.hash || "").replace(/^#\/?/, "");
  return TABS.some((t) => t.id === id) ? id : "today";
}

let nudged = false;
function nudgeBanner() {
  if (!nudged) return null;
  return h(
    "div",
    { class: "nudge" },
    h("span", { class: "icon-chip c-orange", html: ICONS.bell }),
    h("span", {}, "It's past your reminder time and you haven't studied yet today. Start a session to keep your streak.")
  );
}

let activateUpdate = null;
function updateBanner() {
  if (!activateUpdate) return null;
  return h(
    "div",
    { class: "nudge" },
    h("span", { class: "icon-chip c-accent", html: ICONS.refresh }),
    h("span", { class: "spacer" }, "A new version of DailyQCM is ready."),
    h("button", { class: "btn primary", style: "padding:8px 14px", onclick: () => activateUpdate() }, "Reload")
  );
}

let lastRenderedTab = null;
let renderSeq = 0;

// Builds the next view off-screen and swaps it in only once it's ready, so a
// re-render (every store change triggers one) never flashes an empty page.
// The enter animation plays only when the tab actually changed.
async function render() {
  const seq = ++renderSeq;
  const tab = TABS.find((t) => t.id === current) || TABS[0];

  const view = h("div", { id: "view", class: lastRenderedTab === tab.id ? "" : "view-enter" });
  const upd = updateBanner();
  if (upd) view.appendChild(upd);
  const banner = nudgeBanner();
  if (banner) view.appendChild(banner);

  try {
    view.appendChild(await tab.render());
  } catch (err) {
    console.error(err);
    view.appendChild(h("div", { class: "empty" }, "Something went wrong: " + err.message));
  }
  if (seq !== renderSeq) return; // a newer render started while this one awaited

  const scrollY = lastRenderedTab === tab.id ? window.scrollY : 0;
  clear(appRoot).append(view, tabbar());
  window.scrollTo(0, scrollY);
  lastRenderedTab = tab.id;
}

function tabbar() {
  return h(
    "nav",
    { class: "tabbar" },
    ...TABS.map((t) =>
      h("button", {
        class: t.id === current ? "active" : "",
        html: `${t.icon}<span>${t.label}</span>`,
        onclick: () => {
          if (current === t.id) return;
          location.hash = `#/${t.id}`;
        },
      })
    )
  );
}

window.addEventListener("hashchange", () => {
  // A sheet left open would otherwise sit on top of the new tab (e.g. after the
  // browser back gesture), since overlays live outside #app.
  closeOverlay();
  const next = tabFromHash();
  if (next !== current) {
    current = next;
    render();
  }
});

onChange(() => {
  applyTheme();
  render();
});

startNudgeWatcher(() => {
  if (!nudged) {
    nudged = true;
    render();
  }
});

registerServiceWorker().then(() => {
  watchForUpdates((activate) => {
    activateUpdate = activate;
    render();
  });
});
applyTheme();
render();
requestPersistentStorage();
renameBuiltinPaths().catch((err) => console.error(err));
