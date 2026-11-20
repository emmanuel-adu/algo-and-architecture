import { listDocs, getSync, updateSync, getUser } from "./db.js";
import { decrypt } from "./http.js";

const API = "https://api.github.com";
const UA = "algo-and-architecture";

export function clientId() {
  const id = process.env.GITHUB_CLIENT_ID;
  if (!id) throw new Error("GITHUB_CLIENT_ID is not set.");
  return id;
}
function clientSecret() {
  const s = process.env.GITHUB_CLIENT_SECRET;
  if (!s) throw new Error("GITHUB_CLIENT_SECRET is not set.");
  return s;
}

export class GitHubError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/* ---------- OAuth ---------- */
export function authorizeUrl({ redirectUri, state, challenge, scope }) {
  const u = new URL("https://github.com/login/oauth/authorize");
  u.searchParams.set("client_id", clientId());
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("state", state);
  u.searchParams.set("code_challenge", challenge);
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("allow_signup", "true");
  if (scope) u.searchParams.set("scope", scope);
  return u.toString();
}
export async function exchangeCode({ code, redirectUri, verifier }) {
  const r = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", "user-agent": UA },
    body: JSON.stringify({ client_id: clientId(), client_secret: clientSecret(), code, redirect_uri: redirectUri, code_verifier: verifier })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new GitHubError(400, j.error_description || j.error || "GitHub didn't return an access token.");
  return { token: j.access_token, scope: j.scope || "" };
}

/* ---------- REST helpers ---------- */
export async function ghRaw(token, method, path, body) {
  return fetch(API + path, {
    method,
    headers: {
      authorization: "Bearer " + token, accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28", "user-agent": UA,
      ...(body ? { "content-type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
}
export async function gh(token, method, path, body) {
  const r = await ghRaw(token, method, path, body);
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    const msg = r.status === 401 ? "GitHub access was revoked or expired. Reconnect GitHub in Settings."
      : r.status === 403 || r.status === 404 ? "GitHub refused access to the sync repository. Reconnect GitHub in Settings."
      : j.message || "GitHub returned an error (" + r.status + ").";
    throw new GitHubError(r.status, msg);
  }
  return r.status === 204 ? null : r.json();
}
export const getGitHubUser = token => gh(token, "GET", "/user");

// Revokes the app's grant so the broader repo access goes away on disconnect.
export async function revokeGrant(token) {
  const basic = Buffer.from(clientId() + ":" + clientSecret()).toString("base64");
  await fetch(`${API}/applications/${clientId()}/grant`, {
    method: "DELETE",
    headers: { authorization: "Basic " + basic, accept: "application/vnd.github+json", "content-type": "application/json", "user-agent": UA },
    body: JSON.stringify({ access_token: token })
  }).catch(() => {});
}

/* ---------- the sync repository ---------- */
export const MARKER = ".algo-and-architecture";
const REPO_BASE = "algo-and-architecture-data";

// Creates a private repo, or reuses one this app made before (it carries the marker file).
export async function ensureRepo(token, login) {
  for (let i = 1; i <= 6; i++) {
    const name = i === 1 ? REPO_BASE : `${REPO_BASE}-${i}`;
    const r = await ghRaw(token, "POST", "/user/repos", {
      name, private: true, auto_init: true,
      description: "My DSA and system design practice, synced from Algo and Architecture (attempts, notes, worksheets)."
    });
    if (r.status === 201) { const j = await r.json(); return { repo: j.full_name, branch: j.default_branch || "main", created: true }; }
    if (r.status === 422) {
      const m = await ghRaw(token, "GET", `/repos/${login}/${name}/contents/${MARKER}`);
      if (m.status === 200) { const info = await gh(token, "GET", `/repos/${login}/${name}`); return { repo: info.full_name, branch: info.default_branch || "main", created: false }; }
      continue; // a repo with that name exists and isn't ours: try the next name
    }
    const j = await r.json().catch(() => ({}));
    throw new GitHubError(r.status, j.message || "Couldn't create the sync repository.");
  }
  throw new GitHubError(409, "Couldn't find a free repository name. Rename or delete an old algo-and-architecture-data repository and try again.");
}

/* ---------- turning tracker data into files ---------- */
const title = slug => String(slug).replace(/^c-/, "").split("-").map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(" ");
const RATINGS = ["Red", "Yellow", "Green"];
const validAtt = a => a && /^\d{4}-\d{2}-\d{2}$/.test(a.d) && RATINGS.includes(a.r);
const cell = s => String(s ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

export function buildFiles(docs) {
  const files = [];
  const add = (path, content) => files.push({ path, content });
  const items = [];
  for (const { id, data } of docs) {
    add(`data/${id}.json`, JSON.stringify(data, null, 2) + "\n");
    if (id.startsWith("w_")) {
      const key = id.slice(2), track = key.startsWith("s_") ? "design" : "coding";
      add(`worksheets/${track}/${key.slice(2)}.excalidraw`, JSON.stringify({
        type: "excalidraw", version: 2, source: "algo-and-architecture",
        elements: Array.isArray(data.elements) ? data.elements : [],
        appState: { viewBackgroundColor: "#ffffff", gridSize: null }, files: {}
      }, null, 2) + "\n");
      continue;
    }
    if (!/^[ps]_/.test(id)) continue;
    const track = id.startsWith("s_") ? "design" : "coding", slug = id.slice(2);
    const name = data.custom && data.custom.name ? String(data.custom.name) : title(slug);
    const atts = (Array.isArray(data.attempts) ? data.attempts.filter(validAtt) : []).slice().sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : 0);
    const notes = String(data.notes || "").trim();
    if (!atts.length && !notes) continue;
    const link = track === "coding" ? (data.custom && data.custom.url) || `https://leetcode.com/problems/${slug}/` : null;
    let md = `# ${name}\n\n`;
    if (link) md += `[Open the problem](${link})\n\n`;
    if (atts.length) {
      md += `## Attempts\n\n| # | Date | Rating | Minutes | Note |\n|---|---|---|---|---|\n`;
      atts.forEach((a, i) => { md += `| ${i + 1} | ${a.d} | ${a.r} | ${a.min || ""} | ${cell(a.note)} |\n`; });
      md += "\n";
    }
    if (notes) md += `## Notes\n\n${notes}\n`;
    const path = `notes/${track}/${slug}.md`;
    add(path, md);
    items.push({ track, name, path, n: atts.length, last: atts.length ? atts[atts.length - 1] : null });
  }
  items.sort((a, b) => a.track.localeCompare(b.track) || a.name.localeCompare(b.name));
  const total = items.reduce((s, x) => s + x.n, 0);
  let readme = `# DSA and system design practice\n\nSynced from Algo and Architecture. Files are rewritten on every sync, so edit your data in the app rather than here.\n\n`;
  readme += `- ${items.length} problems and topics with attempts or notes\n- ${total} attempts logged\n\n`;
  readme += `Each problem has a readable page in \`notes/\`, worksheets are in \`worksheets/\` (open them at excalidraw.com), and \`data/\` holds the raw records.\n`;
  for (const track of ["coding", "design"]) {
    const rows = items.filter(x => x.track === track);
    if (!rows.length) continue;
    readme += `\n## ${track === "coding" ? "Coding" : "System design"}\n\n| Problem | Attempts | Latest |\n|---|---|---|\n`;
    for (const x of rows) readme += `| [${cell(x.name)}](${x.path}) | ${x.n} | ${x.last ? x.last.r + " on " + x.last.d : ""} |\n`;
  }
  const settingsDoc = docs.find(d => d.id === "settings");
  const roadmap = roadmapFile(settingsDoc && settingsDoc.data && settingsDoc.data.roadmap, docs, new Set(items.map(x => x.path)));
  if (roadmap) { add("ROADMAP.md", roadmap); readme += `\nYour week-by-week plan is in [ROADMAP.md](ROADMAP.md).\n`; }
  add("README.md", readme);
  add(MARKER, "This repository is written by Algo and Architecture. Files here are replaced on every sync.\n");
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

// The Roadmap tab's plan as a checklist: one section per week, ticked once a problem has an attempt.
const LIST_NAMES = { blind75: "Blind 75", neetcode150: "NeetCode 150", grind75: "Grind 75" };
const ISO = /^\d{4}-\d{2}-\d{2}$/, KEY = /^[ps]_[A-Za-z0-9_.~:@+-]{1,180}$/;
const mdText = t => String(t).replace(/[\[\]<>*_`|\\]/g, "\\$&");
function roadmapFile(plan, docs, notePaths) {
  if (!plan || !Array.isArray(plan.weeks) || !plan.weeks.length || !ISO.test(plan.start) || !ISO.test(plan.end)) return null;
  const byId = new Map(docs.map(d => [d.id, d.data || {}]));
  const master = plan.goal === "master", st = byId.get("settings") || {};
  // Same rule as the app: latest rating Green with at least this many attempts.
  const need = { coding: Number(st.mastered) >= 1 ? Number(st.mastered) : 3, design: Number(st.sdMastered) >= 1 ? Number(st.sdMastered) : 2 };
  const isMastered = (atts, track) => {
    const a = atts.filter(validAtt).sort((x, y) => x.d < y.d ? -1 : x.d > y.d ? 1 : 0);
    return a.length >= need[track] && a[a.length - 1].r === "Green";
  };
  const line = key => {
    if (!KEY.test(key)) return null;
    const d = byId.get(key) || {}, track = key.startsWith("s_") ? "design" : "coding", slug = key.slice(2);
    const name = mdText(d.custom && d.custom.name ? d.custom.name : title(slug));
    const atts = Array.isArray(d.attempts) ? d.attempts : [];
    const started = atts.some(validAtt), done = master ? isMastered(atts, track) : started;
    const note = `notes/${track}/${slug}.md`;
    const link = notePaths.has(note) ? note : track === "coding" ? (d.custom && d.custom.url) || `https://leetcode.com/problems/${slug}/` : null;
    return `- [${done ? "x" : " "}] ${link ? `[${name}](${link})` : name}${track === "design" ? " (system design)" : ""}${master && started && !done ? " (started)" : ""}`;
  };
  const list = LIST_NAMES[plan.list] || "your coding list";
  let md = `# Roadmap\n\n${list}${plan.sd ? " and the system design path" : ""}, from ${plan.start} to ${plan.end}: ${plan.weeks.length} weeks`;
  md += Number(plan.days) ? `, ${Number(plan.days)} study days a week.\n\n` : ".\n\n";
  md += master
    ? `Planned for mastery: new problems finish early and the last weeks are for reviews. Ticked items are mastered. This file is rewritten on every sync; change the plan in the app's Roadmap tab.\n`
    : `Ticked items have at least one attempt. This file is rewritten on every sync; change the plan in the app's Roadmap tab.\n`;
  plan.weeks.forEach((w, i) => {
    const range = ISO.test(w.s) && ISO.test(w.e) ? ` (${w.s} to ${w.e})` : "";
    if (w.review) { md += `\n## Week ${i + 1}${range}: review\n\nNo new problems. Work through your review queue so earlier weeks reach mastery.\n`; return; }
    if (w.polish) { md += `\n## Week ${i + 1}${range}: final week\n\nMock interviews and review: redo your Red and Yellow problems against the clock, and talk through two system designs out loud.\n`; return; }
    const rows = [...(Array.isArray(w.dsa) ? w.dsa : []), ...(Array.isArray(w.sd) ? w.sd : [])].map(line).filter(Boolean);
    md += `\n## Week ${i + 1}${range}\n\n${rows.length ? rows.join("\n") : "Nothing new this week."}\n`;
  });
  return md;
}

/* ---------- sync: one commit with the full snapshot ---------- */
const sleep = ms => new Promise(r => setTimeout(r, ms));
export async function syncToGitHub(uid) {
  const s = await getSync(uid);
  if (!s) throw new GitHubError(409, "GitHub isn't connected yet.");
  const token = decrypt(s.token_enc);
  const [owner, name] = s.repo.split("/");
  const base = `/repos/${owner}/${name}`;
  try {
    let ref = null;
    for (let i = 0; i < 3 && !ref; i++) {
      const r = await ghRaw(token, "GET", `${base}/git/ref/heads/${encodeURIComponent(s.branch)}`);
      if (r.ok) ref = await r.json();
      else if (r.status === 404 || r.status === 409) await sleep(1200); // a brand-new repo can take a moment
      else { await gh(token, "GET", `${base}/git/ref/heads/${encodeURIComponent(s.branch)}`); }
    }
    if (!ref) throw new GitHubError(409, "The sync repository has no " + s.branch + " branch yet. Try again in a minute.");
    const parent = ref.object.sha;
    const parentCommit = await gh(token, "GET", `${base}/git/commits/${parent}`);
    const docs = await listDocs(uid);
    const files = buildFiles(docs);
    const tree = await gh(token, "POST", `${base}/git/trees`, {
      tree: files.map(f => ({ path: f.path, mode: "100644", type: "blob", content: f.content }))
    });
    const now = new Date();
    if (tree.sha === parentCommit.tree.sha) {
      await updateSync(uid, { last_sync_at: now, last_error: null });
      return { changed: false, repo: s.repo, commit: parent, at: now.toISOString() };
    }
    const user = await getUser(uid);
    const commit = await gh(token, "POST", `${base}/git/commits`, {
      message: `Sync ${docs.length} records from Algo and Architecture`,
      tree: tree.sha, parents: [parent],
      author: { name: (user && (user.name || user.login)) || "Algo and Architecture", email: `${user ? user.github_id + "+" + user.login : "algo-and-architecture"}@users.noreply.github.com`, date: now.toISOString() }
    });
    await gh(token, "PATCH", `${base}/git/refs/heads/${encodeURIComponent(s.branch)}`, { sha: commit.sha });
    await updateSync(uid, { last_sync_at: now, last_commit: commit.sha, last_error: null });
    return { changed: true, repo: s.repo, commit: commit.sha, at: now.toISOString() };
  } catch (e) {
    await updateSync(uid, { last_error: e.message || "Sync failed." }).catch(() => {});
    throw e;
  }
}
