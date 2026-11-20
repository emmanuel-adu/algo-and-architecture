import { json, fail, session } from "../lib/http.js";
import { getUser } from "../lib/db.js";

export async function GET(req) {
  const s = session(req);
  if (!s) return fail(401, "Not signed in.");
  try {
    const u = await getUser(s.uid);
    if (!u) return fail(401, "Not signed in.");
    return json({ user: { login: u.login, name: u.name, avatar_url: u.avatar_url } });
  } catch (e) {
    return fail(500, e.message);
  }
}
