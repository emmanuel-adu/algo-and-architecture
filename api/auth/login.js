import { redirect, sign, cookie, randomToken, pkceChallenge, baseUrl, fail } from "../../lib/http.js";
import { authorizeUrl } from "../../lib/github.js";

// Sign in with GitHub. No scope is requested, so GitHub only shares the public profile.
export function GET(req) {
  try {
    const state = randomToken(), verifier = randomToken(48);
    const redirectUri = baseUrl(req) + "/api/auth/callback";
    const url = authorizeUrl({ redirectUri, state, challenge: pkceChallenge(verifier) });
    return redirect(url, { "set-cookie": cookie("pt_oauth", sign({ state, verifier, purpose: "login" }, 600), 600) });
  } catch (e) {
    return fail(500, e.message);
  }
}
