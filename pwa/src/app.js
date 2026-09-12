import { h, clear, ICONS } from "./dom.js";
import { onChange } from "./store.js";
import { registerServiceWorker, startNudgeWatcher } from "./notifications.js";

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
    "It's past your reminder time and you haven't studied yet today. Start a session to keep your streak."
  );
}

async function render() {
  const tab = TABS.find((t) => t.id === current) || TABS[0];

  const shell = h("div", {}, h("div", { id: "view" }));
  clear(appRoot).appendChild(shell);
  appRoot.appendChild(tabbar());

  const view = shell.querySelector("#view");
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

onChange(() => render());

startNudgeWatcher(() => {
  if (!nudged) {
    nudged = true;
    render();
  }
});

registerServiceWorker();
render();
