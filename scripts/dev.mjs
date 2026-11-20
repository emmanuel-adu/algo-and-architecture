// Local server for development: serves public/ and runs the api/ functions the way Vercel
// does (Web Request in, Response out). Reads .env.local, which `neon env pull` writes.
// Run with: npm run dev   then open http://localhost:3000
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = path.join(ROOT, "public");
const API = path.join(ROOT, "api");
const PORT = Number(process.env.PORT || 3000);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };

for (const k of ["DATABASE_URL", "SESSION_SECRET", "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"]) {
  if (!process.env[k]) console.warn(`Warning: ${k} is not set. See .env.example.`);
}

const inside = (base, p) => p === base || p.startsWith(base + path.sep);

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      const file = path.resolve(API, "." + url.pathname.slice(4) + ".js");
      if (!inside(API, file)) { res.writeHead(404); return res.end(); }
      const mod = await import(file);
      const handler = mod[req.method];
      if (typeof handler !== "function") { res.writeHead(405); return res.end(); }
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const request = new Request(url, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks) });
      const out = await handler(request);
      const headers = {};
      out.headers.forEach((v, k) => { if (k !== "set-cookie") headers[k] = v; });
      const cookies = out.headers.getSetCookie();
      if (cookies.length) headers["set-cookie"] = cookies;
      res.writeHead(out.status, headers);
      return res.end(Buffer.from(await out.arrayBuffer()));
    }
    const file = path.resolve(PUBLIC, "." + (url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname)));
    if (!inside(PUBLIC, file)) { res.writeHead(404); return res.end(); }
    const data = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  } catch (e) {
    const missing = e.code === "ENOENT" || e.code === "ERR_MODULE_NOT_FOUND";
    if (!missing) console.error(e);
    res.writeHead(missing ? 404 : 500, { "content-type": "text/plain" });
    res.end(missing ? "Not found" : "Server error");
  }
}).listen(PORT, () => console.log(`Algo and Architecture running at http://localhost:${PORT}`));
