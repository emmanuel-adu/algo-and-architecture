import { redirect, sign, cookie, randomToken, pkceChallenge, baseUrl, session, fail } from "../../lib/http.js";
import { authorizeUrl } from "../../lib/github.js";

// Optional: asks GitHub for repository access so the tracker can create and update a private repo.
export function GET(req) {
  if (!session(req)) return redirect(baseUrl(req) + "/?auth_error=" + encodeURIComponent("Sign in first, then connect GitHub sync."));
  try {
    const state = randomToken(), verifier = randomToken(48);
    const url = authorizeUrl({ redirectUri: baseUrl(req) + "/api/auth/callback", state, challenge: pkceChallenge(verifier), scope: "repo" });
    return redirect(url, { "set-cookie": cookie("pt_oauth", sign({ state, verifier, purpose: "sync" }, 600), 600) });
  } catch (e) { return fail(500, e.message); }
}
