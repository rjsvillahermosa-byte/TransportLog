// Minimal production server — serves the built SPA from ./dist with history
// fallback, so client-side routes (/fleet, /mission/:id, …) work on refresh.
// Used by `npm start` (containers / any Node host). No dependencies.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DIST = path.join(__dirname, "dist");
const PORT = process.env.PORT || 8080;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  let filePath = path.join(DIST, path.normalize(urlPath).replace(/^(\.\.[/\\])+/, ""));
  if (!filePath.startsWith(DIST)) filePath = path.join(DIST, "index.html");

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) filePath = path.join(DIST, "index.html"); // SPA fallback
    const ext = path.extname(filePath).toLowerCase();
    res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
    if (urlPath.startsWith("/assets/")) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    fs.createReadStream(filePath).on("error", () => {
      res.statusCode = 404;
      res.end("Not found");
    }).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`TransportLog serving ./dist on http://0.0.0.0:${PORT}`);
});
