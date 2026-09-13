import { h, clear, ICONS } from "./dom.js";
import { onChange, getSettings } from "./store.js";
import { registerServiceWorker, startNudgeWatcher } from "./notifications.js";
import { watchForUpdates } from "./updates.js";

import { renderDaily } from "./views/daily.js";
import { renderStats } from "./views/stats.js";
import { renderStreak } from "./views/streak.js";
import { renderDecks } from "./views/decks.js";

const TABS = [
  { id: "today", label: "Today", icon: ICONS.today, render: renderDaily },
  { id: "stats", label: "Stats", icon: ICONS.stats, render: renderStats },
  { id: "streak", label: "Streak", icon: ICONS.streak, render: renderStreak },
  { id: "decks", label: "Decks", icon: ICONS.decks, render: renderDecks },
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
}

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

async function render() {
  const tab = TABS.find((t) => t.id === current) || TABS[0];

  const shell = h("div", {}, h("div", { id: "view" }));
  clear(appRoot).appendChild(shell);
  appRoot.appendChild(tabbar());

  const view = shell.querySelector("#view");
  const upd = updateBanner();
  if (upd) view.appendChild(upd);
  const banner = nudgeBanner();
  if (banner) view.appendChild(banner);

  try {
    const content = await tab.render();
    view.appendChild(content);
  } catch (err) {
    console.error(err);
    view.appendChild(h("div", { class: "empty" }, "Something went wrong: " + err.message));
  }
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
