import { json, fail, session, sameOrigin } from "../../lib/http.js";
import { getSync, updateSync } from "../../lib/db.js";

const view = s => s ? {
  connected: true, repo: s.repo, url: "https://github.com/" + s.repo, branch: s.branch, auto: s.auto,
  lastSyncAt: s.last_sync_at ? new Date(s.last_sync_at).toISOString() : null, lastCommit: s.last_commit || null, lastError: s.last_error || null
} : { connected: false };

export async function GET(req) {
  const s = session(req); if (!s) return fail(401, "Not signed in.");
  try { return json(view(await getSync(s.uid))); } catch (e) { return fail(500, e.message); }
}
// Turn automatic sync on or off.
export async function PATCH(req) {
  const s = session(req); if (!s) return fail(401, "Not signed in.");
  if (!sameOrigin(req)) return fail(403, "Cross-site request blocked.");
  let body; try { body = await req.json(); } catch { return fail(400, "Send JSON."); }
  if (typeof body.auto !== "boolean") return fail(400, "auto must be true or false.");
  try {
    if (!await getSync(s.uid)) return fail(409, "GitHub isn't connected yet.");
    await updateSync(s.uid, { auto: body.auto });
    return json(view(await getSync(s.uid)));
  } catch (e) { return fail(500, e.message); }
}
