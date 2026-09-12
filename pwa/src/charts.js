// Tiny dependency-free SVG charts + a GitHub-style heatmap. Browser-only.
import { pct, startOfDay, addDays, fmtDateFull } from "./format.js";

const NS = "http://www.w3.org/2000/svg";
const el = (tag, attrs = {}, children = []) => {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  for (const c of [].concat(children)) if (c) node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  return node;
};

function rateColor(rate) {
  if (rate >= 0.8) return "var(--green)";
  if (rate >= 0.6) return "var(--yellow)";
  if (rate >= 0.4) return "var(--orange)";
  return "var(--red)";
}

// data: [{ label, rate, total }]  — horizontal bars, 0..1 domain
export function horizontalBars(data, { width = 320 } = {}) {
  const rowH = 30;
  const labelW = 96;
  const valW = 54;
  const height = Math.max(rowH, data.length * rowH) + 8;
  const trackW = width - labelW - valW;

  const svg = el("svg", { viewBox: `0 0 ${width} ${height}`, role: "img" });
  data.forEach((d, i) => {
    const y = i * rowH + 6;
    svg.appendChild(el("text", { x: labelW - 8, y: y + 15, "text-anchor": "end", class: "bar-lbl" }, trunc(d.label, 14)));
    svg.appendChild(el("rect", { x: labelW, y: y + 4, width: trackW, height: 14, rx: 4, fill: "var(--surface-2)" }));
    svg.appendChild(
      el("rect", { x: labelW, y: y + 4, width: Math.max(2, trackW * d.rate), height: 14, rx: 4, fill: rateColor(d.rate) })
    );
    svg.appendChild(
      el("text", { x: width, y: y + 15, "text-anchor": "end", class: "bar-val" }, `${pct(d.rate)}·${d.total}`)
    );
  });
  return wrap(svg);
}

// data: [{ label, rate }] — vertical bars, 0..1 domain
export function verticalBars(data, { width = 320, height = 150 } = {}) {
  const padB = 22;
  const padT = 14;
  const gap = 10;
  const barW = (width - gap * (data.length + 1)) / Math.max(1, data.length);
  const svg = el("svg", { viewBox: `0 0 ${width} ${height}`, role: "img" });

  [0, 0.5, 1].forEach((g) => {
    const y = padT + (height - padT - padB) * (1 - g);
    svg.appendChild(el("line", { x1: 0, y1: y, x2: width, y2: y, class: "gridline" }));
  });

  data.forEach((d, i) => {
    const x = gap + i * (barW + gap);
    const h = (height - padT - padB) * d.rate;
    const y = height - padB - h;
    svg.appendChild(el("rect", { x, y, width: barW, height: Math.max(2, h), rx: 4, fill: rateColor(d.rate) }));
    svg.appendChild(el("text", { x: x + barW / 2, y: height - 6, "text-anchor": "middle", class: "bar-lbl" }, d.label));
    svg.appendChild(el("text", { x: x + barW / 2, y: y - 4, "text-anchor": "middle", class: "bar-val" }, pct(d.rate)));
  });
  return wrap(svg);
}

// points: [{ day, rate, answered }] — line of accuracy over time
export function lineChart(points, { width = 320, height = 160 } = {}) {
  const padL = 28;
  const padB = 20;
  const padT = 12;
  const plotted = points.filter((p) => p.answered > 0);
  const svg = el("svg", { viewBox: `0 0 ${width} ${height}`, role: "img" });

  [0, 0.5, 1].forEach((g) => {
    const y = padT + (height - padT - padB) * (1 - g);
    svg.appendChild(el("line", { x1: padL, y1: y, x2: width, y2: y, class: "gridline" }));
    svg.appendChild(el("text", { x: padL - 6, y: y + 3, "text-anchor": "end", class: "bar-val" }, pct(g)));
  });

  if (plotted.length === 0) {
    svg.appendChild(el("text", { x: width / 2, y: height / 2, "text-anchor": "middle", class: "bar-lbl" }, "No activity in this window"));
    return wrap(svg);
  }

  const xs = (i, n) => padL + (width - padL - 4) * (n <= 1 ? 0.5 : i / (n - 1));
  const ys = (r) => padT + (height - padT - padB) * (1 - r);
  const idxMap = points.map((p, i) => [p, i]).filter(([p]) => p.answered > 0);
  const coords = idxMap.map(([p, i]) => [xs(i, points.length), ys(p.rate)]);

  svg.appendChild(
    el("path", {
      d: coords.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" "),
      fill: "none",
      stroke: "var(--accent)",
      "stroke-width": 2,
    })
  );
  coords.forEach(([x, y]) => svg.appendChild(el("circle", { cx: x, cy: y, r: 3, fill: "var(--accent)" })));
  return wrap(svg);
}

// byDayMap: Map<dayStartMs, { answered, correct }>
export function heatmap(byDayMap, { weeks = 20, maxAnswered = 1, onSelect } = {}) {
  const today = startOfDay().getTime();
  const weekday = new Date(today).getDay(); // 0 = Sunday
  const lastSunday = addDays(today, -weekday).getTime();
  const firstSunday = addDays(lastSunday, -7 * (weeks - 1)).getTime();

  const container = document.createElement("div");
  container.className = "heatmap";

  for (let w = 0; w < weeks; w++) {
    const col = document.createElement("div");
    col.className = "wk";
    for (let d = 0; d < 7; d++) {
      const dayMs = addDays(firstSunday, w * 7 + d).getTime();
      const cell = document.createElement("div");
      cell.className = "d";
      if (dayMs > today) {
        cell.classList.add("future");
      } else {
        const rec = byDayMap.get(dayMs);
        const lvl = level(rec, maxAnswered);
        if (lvl) cell.classList.add(`l${lvl}`);
        cell.title = `${fmtDateFull(dayMs)} — ${rec ? `${rec.answered} answered, ${rec.correct} correct` : "no study"}`;
        if (onSelect) cell.addEventListener("click", () => onSelect(dayMs, rec));
      }
      col.appendChild(cell);
    }
    container.appendChild(col);
  }
  return container;
}

function level(rec, maxAnswered) {
  if (!rec || rec.answered <= 0) return 0;
  const f = rec.answered / Math.max(1, maxAnswered);
  if (f < 0.25) return 1;
  if (f < 0.5) return 2;
  if (f < 0.75) return 3;
  return 4;
}

function wrap(svg) {
  const div = document.createElement("div");
  div.className = "chart";
  div.appendChild(svg);
  return div;
}

const trunc = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
