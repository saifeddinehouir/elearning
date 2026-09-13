// Minimal hyperscript + a couple of UI helpers. Browser-only.

export function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k === "dataset") Object.assign(node.dataset, v);
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in node && k !== "list") {
      try { node[k] = v; } catch { node.setAttribute(k, v); }
    } else node.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export const clear = (node) => {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
};

export function toast(message, ms = 2200) {
  const root = document.getElementById("toast-root");
  const t = h("div", { class: "toast" }, message);
  root.appendChild(t);
  setTimeout(() => {
    t.style.transition = "opacity .2s";
    t.style.opacity = "0";
    setTimeout(() => t.remove(), 200);
  }, ms);
}

const overlayRoot = () => document.getElementById("overlay-root");
const SHEET_EXIT_MS = 220;

// Lets the sheet slide down before it's removed, instead of vanishing
// instantly. Safe to call even if another openOverlay() clobbers it mid-close
// (clear() just removes whatever is there).
function animatedClose(root) {
  const el = root.firstElementChild;
  if (!el) return;
  el.classList.add("closing");
  setTimeout(() => {
    if (root.firstElementChild === el) clear(root);
  }, SHEET_EXIT_MS);
}

export function openOverlay(buildFn) {
  const root = overlayRoot();
  clear(root);
  const close = () => animatedClose(root);
  root.appendChild(buildFn(close));
  return close;
}

export const closeOverlay = () => animatedClose(overlayRoot());

export const icon = (paths) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

export const ICONS = {
  today: icon('<path d="M13 2L3 14h7l-1 8 10-12h-7z"/>'),
  stats: icon('<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>'),
  streak: icon('<path d="M12 2s5 4 5 10a5 5 0 0 1-10 0c0-2 1-3 1-3s-1 4 2 4 2-4 2-4c0-3-2-7-2-7z"/>'),
  decks: icon('<rect x="3" y="4" width="18" height="5" rx="1"/><rect x="3" y="11" width="18" height="5" rx="1"/><rect x="3" y="18" width="18" height="3" rx="1"/>'),
  bell: icon('<path d="M6 8a6 6 0 0 1 12 0c0 4 1.5 6 2 7H4c.5-1 2-3 2-7z"/><path d="M9 17a3 3 0 0 0 6 0"/>'),
  refresh: icon('<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>'),
  gear: icon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'),
  target: icon('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>'),
  sliders: icon('<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="2" y1="14" x2="6" y2="14"/><line x1="10" y1="8" x2="14" y2="8"/><line x1="18" y1="16" x2="22" y2="16"/>'),
  clock: icon('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>'),
  trash: icon('<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/>'),
  book: icon('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>'),
  code: icon('<polyline points="8 6 3 12 8 18"/><polyline points="16 6 21 12 16 18"/>'),
  chevron: icon('<polyline points="9 6 15 12 9 18"/>'),
  theme: icon('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  search: icon('<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>'),
  flag: icon('<path d="M4 21V4"/><path d="M4 4h13l-2.5 4L17 12H4"/>'),
  chevronLeft: icon('<polyline points="15 6 9 12 15 18"/>'),
};
