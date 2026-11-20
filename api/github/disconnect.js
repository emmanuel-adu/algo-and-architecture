import { json, fail, session, sameOrigin, decrypt } from "../../lib/http.js";
import { getSync, clearSync } from "../../lib/db.js";
import { revokeGrant } from "../../lib/github.js";

// Stops syncing, forgets the stored token and revokes the repo access on GitHub. The repo itself stays.
export async function POST(req) {
  const s = session(req); if (!s) return fail(401, "Not signed in.");
  if (!sameOrigin(req)) return fail(403, "Cross-site request blocked.");
  try {
    const row = await getSync(s.uid);
    if (row) { try { await revokeGrant(decrypt(row.token_enc)); } catch {} await clearSync(s.uid); }
    return json({ connected: false });
  } catch (e) { return fail(500, e.message); }
}
