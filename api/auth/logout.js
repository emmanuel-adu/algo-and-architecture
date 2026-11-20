import { json, cookie, sameOrigin, fail, SESSION_COOKIE } from "../../lib/http.js";

export function POST(req) {
  if (!sameOrigin(req)) return fail(403, "Cross-site request blocked.");
  return json({ ok: true }, 200, { "set-cookie": cookie(SESSION_COOKIE, "", 0) });
}
