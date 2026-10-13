// Generates the PNG app icons from scratch (no dependencies) so the PWA has a
// real home-screen icon on iOS. Run once:  npm run icons
//
// Produces: icons/icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png
// Produces icons/icon.svg too, from the same geometry.

import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ICONS_DIR = resolve(fileURLToPath(new URL("../icons/", import.meta.url)));

const ACCENT = [37, 65, 255]; // #2541FF
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

// Design (Swiss): a flat cobalt square with four white answer bars, the
// second one longer — the picked answer in a multiple-choice question.
// Geometry is in a 512-unit grid and shared by the PNGs and icons/icon.svg.
const BARS = [
  [96, 128, 176, 40],
  [96, 200, 320, 40],
  [96, 272, 240, 40],
  [96, 344, 144, 40],
];

// Fraction of the pixel square [x, x+1]×[y, y+1] covered by a rect (anti-aliasing).
function coverage(x, y, [rx, ry, rw, rh]) {
  const ox = Math.max(0, Math.min(x + 1, rx + rw) - Math.max(x, rx));
  const oy = Math.max(0, Math.min(y + 1, ry + rh) - Math.max(y, ry));
  return ox * oy;
}

function drawIcon(size, { maskable = false } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  // Maskable icons get cropped to a circle-ish safe zone: shrink the mark to 80%.
  const k = (size / 512) * (maskable ? 0.8 : 1);
  const off = maskable ? size * 0.1 : 0;
  const bars = BARS.map(([x, y, w, h]) => [off + x * k, off + y * k, w * k, h * k]);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const t = Math.min(1, bars.reduce((s, b) => s + coverage(x, y, b), 0));
      rgba[i] = Math.round(ACCENT[0] + (WHITE[0] - ACCENT[0]) * t);
      rgba[i + 1] = Math.round(ACCENT[1] + (WHITE[1] - ACCENT[1]) * t);
      rgba[i + 2] = Math.round(ACCENT[2] + (WHITE[2] - ACCENT[2]) * t);
      rgba[i + 3] = 255;
    }
  }
  return encodePNG(size, size, rgba);
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="DailyQCM">
  <rect width="512" height="512" fill="#2541FF"/>
${BARS.map(([x, y, w, h]) => `  <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#FFFFFF"/>`).join("\n")}
</svg>
`;

const outputs = [
  ["icon-192.png", drawIcon(192)],
  ["icon-512.png", drawIcon(512)],
  ["icon-maskable-512.png", drawIcon(512, { maskable: true })],
  ["apple-touch-icon.png", drawIcon(180)],
  ["icon.svg", Buffer.from(svg)],
];

for (const [name, buf] of outputs) {
  writeFileSync(resolve(ICONS_DIR, name), buf);
  console.log(`wrote icons/${name} (${buf.length} bytes)`);
}
