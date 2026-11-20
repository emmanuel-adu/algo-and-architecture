import { json, fail, session } from "../lib/http.js";
import { getUser } from "../lib/db.js";

// Who is signed in. Without a session the app works in this browser only, so that's not an error.
export async function GET(req) {
  const s = session(req);
  if (!s) return json({ user: null });
  try {
    const u = await getUser(s.uid);
    if (!u) return json({ user: null });
    return json({ user: { login: u.login, name: u.name, avatar_url: u.avatar_url } });
  } catch (e) {
    return fail(500, e.message);
  }
}
