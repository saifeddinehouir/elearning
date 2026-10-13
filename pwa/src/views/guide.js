import { h, clear, openOverlay } from "../dom.js";
import { PATHS } from "../patterns.js";

// The "how to recognise and solve it" block for one pattern. Accepts either a
// deck's stored guide or a pattern entry from PATHS (same field names).
export function guideBlock(guide, { compact = false } = {}) {
  const wrap = h("div", { class: "guide" });
  wrap.appendChild(h("div", { class: "guide-label" }, "Spot it when"));
  wrap.appendChild(h("ul", { class: "guide-signals" }, ...guide.signals.map((s) => h("li", {}, s))));
  wrap.appendChild(h("div", { class: "guide-label" }, "Core idea"));
  wrap.appendChild(h("p", { class: "guide-idea" }, guide.idea));
  if (!compact) {
    wrap.appendChild(h("div", { class: "guide-label" }, "Template"));
    wrap.appendChild(h("pre", { class: "code" }, h("code", {}, guide.template)));
  }
  wrap.appendChild(h("div", { class: "guide-cx" }, h("span", { class: "badge accent" }, "Complexity"), " ", guide.complexity));
  return wrap;
}

// Every pattern's signals on one searchable screen: the thing to skim before
// an interview, or when a problem has you stuck on where to start. A typed
// clue searches every path; with no clue, the selected path is listed.
export function openCheatSheet(pathKey) {
  let selected = PATHS.find((p) => p.key === pathKey) || PATHS[0];

  openOverlay((close) => {
    const overlay = h("div", { class: "overlay" });
    const head = h("div", { class: "o-head" });
    const controls = h("div", { style: "padding:0 16px 10px;display:flex;flex-direction:column;gap:10px" });
    const body = h("div", { class: "o-body" });
    overlay.append(head, controls, body);
    head.append(h("button", { class: "btn", onclick: close }, "Close"), h("strong", {}, "Pattern cheat sheet"), h("div", { class: "spacer" }));

    const seg = h("div", { class: "segmented" });
    const segButtons = PATHS.map((p) => {
      const b = h(
        "button",
        {
          onclick: () => {
            selected = p;
            input.value = "";
            paint();
          },
        },
        `${p.tone === "hard" ? "Advanced" : "Core"} · ${p.patterns.length}`
      );
      seg.appendChild(b);
      return [p, b];
    });
    const input = h("input", {
      type: "search",
      placeholder: "Filter by a clue, e.g. “contiguous” or “minimise the maximum”",
      oninput: paint,
    });
    controls.append(seg, input);
    const list = h("div", {});
    body.appendChild(list);

    function paint() {
      const query = input.value.trim().toLowerCase();
      for (const [p, b] of segButtons) b.classList.toggle("active", !query && p === selected);
      clear(list);
      const pool = query ? PATHS : [selected];
      const matches = pool.flatMap((path) =>
        path.patterns
          .map((p, i) => ({ p, i, path }))
          .filter(({ p }) => !query || [p.name, p.tagline, p.idea, ...p.signals].join(" ").toLowerCase().includes(query))
      );
      if (matches.length === 0) {
        list.appendChild(h("p", { class: "small muted", style: "text-align:center;padding:28px 0" }, "No pattern matches that clue."));
        return;
      }
      for (const { p, i, path } of matches) {
        const det = h("details", { class: `card cheat${path.tone === "hard" ? " hard" : ""}`, open: !!query && matches.length <= 3 });
        det.appendChild(
          h(
            "summary",
            {},
            h("span", { class: "cheat-num" }, String(i + 1).padStart(2, "0")),
            h(
              "span",
              { class: "spacer" },
              h("span", { class: "cheat-name" }, p.name),
              h("span", { class: "cheat-tag" }, query ? `${path.name} · ${p.tagline}` : p.tagline)
            )
          )
        );
        det.appendChild(guideBlock(p));
        list.appendChild(det);
      }
    }

    paint();
    return overlay;
  });
}
