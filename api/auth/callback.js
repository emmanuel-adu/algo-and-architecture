import { redirect, verify, getCookie, cookie, sign, session, baseUrl, encrypt, SESSION_COOKIE, SESSION_TTL } from "../../lib/http.js";
import { exchangeCode, getGitHubUser, ensureRepo } from "../../lib/github.js";
import { upsertUser, getUser, saveSync } from "../../lib/db.js";

// GitHub sends the browser back here after sign-in and after connecting sync.
export async function GET(req) {
  const url = new URL(req.url);
  const home = baseUrl(req) + "/";
  const back = (params, extraCookie) => {
    const h = new Headers();
    h.append("set-cookie", cookie("pt_oauth", "", 0));
    if (extraCookie) h.append("set-cookie", extraCookie);
    return redirect(home + "?" + new URLSearchParams(params).toString() + (params.github ? "#config" : ""), h);
  };
  const st = verify(getCookie(req, "pt_oauth"));
  if (url.searchParams.get("error")) return back({ auth_error: url.searchParams.get("error_description") || "GitHub sign-in was cancelled." });
  const code = url.searchParams.get("code"), state = url.searchParams.get("state");
  if (!st || !code || !state || state !== st.state) return back({ auth_error: "The sign-in link expired. Please try again." });
  try {
    const redirectUri = baseUrl(req) + "/api/auth/callback";
    const { token, scope } = await exchangeCode({ code, redirectUri, verifier: st.verifier });
    const ghUser = await getGitHubUser(token);
    if (st.purpose === "sync") {
      const s = session(req);
      const me = s && await getUser(s.uid);
      if (!me) return back({ auth_error: "Sign in first, then connect GitHub sync." });
      if (Number(me.github_id) !== Number(ghUser.id)) return back({ github_error: `You're signed in as @${me.login} but authorized @${ghUser.login}. Connect the same account you sign in with.` });
      if (!/(^|[ ,])repo([ ,]|$)/.test(scope)) return back({ github_error: "GitHub didn't grant repository access, so sync can't write to a repo." });
      const r = await ensureRepo(token, ghUser.login);
      await saveSync(me.id, { token_enc: encrypt(token), scope, repo: r.repo, branch: r.branch });
      return back({ github: r.created ? "created" : "connected" });
    }
    // Plain sign-in: the token is only used to read the profile and is not stored.
    const user = await upsertUser(ghUser);
    return back({ signed_in: "1" }, cookie(SESSION_COOKIE, sign({ uid: String(user.id), login: user.login }, SESSION_TTL), SESSION_TTL));
  } catch (e) {
    return back({ [st.purpose === "sync" ? "github_error" : "auth_error"]: e.message || "Something went wrong talking to GitHub." });
  }
}
