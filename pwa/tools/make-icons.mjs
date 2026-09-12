// Generates the PNG app icons from scratch (no dependencies) so the PWA has a
// real home-screen icon on iOS. Run once:  npm run icons
//
// Produces: icons/icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png
// Design: accent-blue rounded square with a white check mark.

import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ICONS_DIR = resolve(fileURLToPath(new URL("../icons/", import.meta.url)));

const ACCENT = [55, 128, 236]; // #3780EC
const WHITE = [255, 255, 255];

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "latin1");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  // 10,11,12 = compression / filter / interlace = 0

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }

  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// distance from point (px,py) to segment (ax,ay)-(bx,by)
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function drawIcon(size, { maskable = false } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const pad = maskable ? size * 0.10 : 0;             // safe area for maskable
  const r = maskable ? size * 0.001 : size * 0.22;    // corner radius
  const inner = size - pad * 2;

  // check mark geometry (relative to inner box)
  const p1 = [pad + inner * 0.26, pad + inner * 0.53];
  const p2 = [pad + inner * 0.44, pad + inner * 0.70];
  const p3 = [pad + inner * 0.76, pad + inner * 0.32];
  const stroke = inner * 0.075;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;

      // rounded-rect background alpha
      let inside = 1;
      if (!maskable) {
        const cx = Math.min(Math.max(x, r), size - r);
        const cy = Math.min(Math.max(y, r), size - r);
        const d = Math.hypot(x - cx, y - cy);
        inside = d <= r ? 1 : d <= r + 1 ? r + 1 - d : 0;
      }

      if (inside <= 0) { rgba[i + 3] = 0; continue; }

      const dCheck = Math.min(
        segDist(x, y, p1[0], p1[1], p2[0], p2[1]),
        segDist(x, y, p2[0], p2[1], p3[0], p3[1])
      );
      const onCheck = dCheck <= stroke ? 1 : dCheck <= stroke + 1.5 ? (stroke + 1.5 - dCheck) / 1.5 : 0;

      const base = ACCENT;
      const col = [
        Math.round(base[0] + (WHITE[0] - base[0]) * onCheck),
        Math.round(base[1] + (WHITE[1] - base[1]) * onCheck),
        Math.round(base[2] + (WHITE[2] - base[2]) * onCheck),
      ];
      rgba[i] = col[0];
      rgba[i + 1] = col[1];
      rgba[i + 2] = col[2];
      rgba[i + 3] = Math.round(255 * inside);
    }
  }
  return encodePNG(size, size, rgba);
}

const outputs = [
  ["icon-192.png", drawIcon(192)],
  ["icon-512.png", drawIcon(512)],
  ["icon-maskable-512.png", drawIcon(512, { maskable: true })],
  ["apple-touch-icon.png", drawIcon(180)],
];

for (const [name, buf] of outputs) {
  writeFileSync(resolve(ICONS_DIR, name), buf);
  console.log(`wrote icons/${name} (${buf.length} bytes)`);
}
