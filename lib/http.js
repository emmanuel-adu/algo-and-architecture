import { createHmac, timingSafeEqual, randomBytes, createHash, createCipheriv, createDecipheriv } from "node:crypto";

/* ---------- responses ---------- */
export function json(data, status = 200, headers) {
  const h = new Headers(headers);
  h.set("content-type", "application/json; charset=utf-8");
  h.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { status, headers: h });
}
export function redirect(location, headers) {
  const h = new Headers(headers);
  h.set("location", location);
  h.set("cache-control", "no-store");
  return new Response(null, { status: 302, headers: h });
}
export const fail = (status, message) => json({ error: message }, status);

/* ---------- cookies ---------- */
export function getCookie(req, name) {
  const raw = req.headers.get("cookie") || "";
  for (const part of raw.split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === name) {
      try { return decodeURIComponent(part.slice(i + 1)); } catch { return null; }
    }
  }
  return null;
}
export function cookie(name, value, maxAge) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

/* ---------- signed values (sessions, OAuth state) ---------- */
function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set to a random string of at least 32 characters.");
  return s;
}
export function sign(obj, ttlSeconds) {
  const body = Buffer.from(JSON.stringify({ ...obj, exp: Math.floor(Date.now() / 1000) + ttlSeconds })).toString("base64url");
  const mac = createHmac("sha256", secret()).update(body).digest("base64url");
  return body + "." + mac;
}
export function verify(token) {
  if (!token || typeof token !== "string") return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const want = createHmac("sha256", secret()).update(body).digest();
  const got = Buffer.from(mac, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  let obj; try { obj = JSON.parse(Buffer.from(body, "base64url").toString("utf8")); } catch { return null; }
  if (!obj || typeof obj.exp !== "number" || obj.exp < Date.now() / 1000) return null;
  return obj;
}

/* ---------- session ---------- */
export const SESSION_COOKIE = "pt_session";
export const SESSION_TTL = 60 * 60 * 24 * 30;
export function session(req) {
  const s = verify(getCookie(req, SESSION_COOKIE));
  return s && s.uid ? s : null;
}
// Blocks cross-site writes on top of SameSite=Lax cookies.
export function sameOrigin(req) {
  const origin = req.headers.get("origin");
  if (!origin) return req.headers.get("sec-fetch-site") !== "cross-site";
  return origin === new URL(req.url).origin;
}
export function baseUrl(req) {
  return (process.env.PUBLIC_URL || new URL(req.url).origin).replace(/\/+$/, "");
}

/* ---------- PKCE ---------- */
export const randomToken = (n = 32) => randomBytes(n).toString("base64url");
export const pkceChallenge = verifier => createHash("sha256").update(verifier).digest("base64url");

/* ---------- encryption for the stored GitHub token ---------- */
const tokenKey = () => createHash("sha256").update("github-token:" + secret()).digest();
export function encrypt(text) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", tokenKey(), iv);
  const ct = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64url");
}
export function decrypt(blob) {
  const buf = Buffer.from(blob, "base64url");
  const d = createDecipheriv("aes-256-gcm", tokenKey(), buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8");
}
