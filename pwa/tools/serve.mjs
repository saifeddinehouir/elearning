// Zero-dependency static dev server for the DailyQCM PWA.
// Usage: npm run serve   ->   http://localhost:5173
//
// Serves files from the pwa/ directory, falls back to index.html for client
// routes, and sends no-cache headers so edits show up on reload. Service
// workers and the Notification API work on http://localhost without HTTPS.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
const PORT = process.env.PORT ? Number(process.env.PORT) : 5173;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith("/")) pathname += "index.html";

    let filePath = normalize(join(ROOT, pathname));
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403).end("Forbidden");
      return;
    }

    let info = await stat(filePath).catch(() => null);
    if (!info || !info.isFile()) {
      // SPA fallback: unknown non-asset route -> index.html
      if (!extname(pathname)) {
        filePath = join(ROOT, "index.html");
        info = await stat(filePath).catch(() => null);
      }
      if (!info) {
        res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
        return;
      }
    }

    const body = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": MIME[extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Service-Worker-Allowed": "/",
    });
    res.end(body);
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/plain" }).end(String(err));
  }
});

server.listen(PORT, () => {
  console.log(`DailyQCM PWA  ->  http://localhost:${PORT}`);
  console.log(`Serving ${ROOT}`);
});
