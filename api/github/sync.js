import { json, fail, session, sameOrigin } from "../../lib/http.js";
import { syncToGitHub } from "../../lib/github.js";

// Writes a full snapshot of your data to the sync repo as one commit (skipped when nothing changed).
export async function POST(req) {
  const s = session(req); if (!s) return fail(401, "Not signed in.");
  if (!sameOrigin(req)) return fail(403, "Cross-site request blocked.");
  try { return json(await syncToGitHub(s.uid)); }
  catch (e) { return fail(e.status && e.status < 500 ? (e.status === 401 || e.status === 403 || e.status === 404 ? 409 : e.status) : 502, e.message || "Sync failed."); }
}
