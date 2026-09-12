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

export function openOverlay(buildFn) {
  const root = overlayRoot();
  clear(root);
  const close = () => clear(root);
  root.appendChild(buildFn(close));
  return close;
}

export const closeOverlay = () => clear(overlayRoot());

export const icon = (paths) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

export const ICONS = {
  today: icon('<path d="M13 2L3 14h7l-1 8 10-12h-7z"/>'),
  stats: icon('<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>'),
  streak: icon('<path d="M12 2s5 4 5 10a5 5 0 0 1-10 0c0-2 1-3 1-3s-1 4 2 4 2-4 2-4c0-3-2-7-2-7z"/>'),
  decks: icon('<rect x="3" y="4" width="18" height="5" rx="1"/><rect x="3" y="11" width="18" height="5" rx="1"/><rect x="3" y="18" width="18" height="3" rx="1"/>'),
};
