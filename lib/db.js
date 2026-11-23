import pg from "pg";
import { attachDatabasePool } from "@vercel/functions";

// Neon Postgres through node-postgres. DATABASE_URL is Neon's pooled connection string
// (host ends in -pooler), which suits serverless functions. Each function instance keeps
// one small pool; attachDatabasePool lets Vercel Fluid compute close idle connections
// before an instance is suspended.
let pool = null;
export function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set. Run `neon env pull` for local development, or add it to the Vercel project's environment variables.");
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5, idleTimeoutMillis: 5000, connectionTimeoutMillis: 10000 });
    pool.on("error", e => console.error("Postgres pool error:", e.message));
    attachDatabasePool(pool);
  }
  return pool;
}

// q(text, params) runs one parameterised statement and resolves to its rows.
let runner = null;
export function useRunner(fn) { runner = fn; schemaReady = null; }
function getRunner() {
  if (!runner) runner = (text, params = []) => getPool().query(text, params).then(r => r.rows);
  return runner;
}
export async function q(text, params = []) { await ensureSchema(); return getRunner()(text, params); }

export const SCHEMA = [
  `create table if not exists users (
     id bigserial primary key,
     github_id bigint unique not null,
     login text not null,
     name text,
     avatar_url text,
     created_at timestamptz not null default now(),
     last_seen_at timestamptz not null default now()
   )`,
  `create table if not exists docs (
     user_id bigint not null references users(id) on delete cascade,
     id text not null,
     data jsonb not null,
     version integer not null default 1,
     updated_at timestamptz not null default now(),
     primary key (user_id, id)
   )`,
  `create table if not exists github_sync (
     user_id bigint primary key references users(id) on delete cascade,
     token_enc text not null,
     scope text,
     repo text not null,
     branch text not null default 'main',
     auto boolean not null default true,
     last_sync_at timestamptz,
     last_commit text,
     last_error text
   )`
];
// `npm run db:migrate` creates the tables up front over the direct connection. As a safety
// net, each function instance also checks them once (idempotent, no parameters) before its
// first query.
let schemaReady = null;
function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => { const run = getRunner(); for (const s of SCHEMA) await run(s, []); })();
    schemaReady.catch(() => { schemaReady = null; });
  }
  return schemaReady;
}

/* ---------- users ---------- */
export async function upsertUser(gh) {
  const rows = await q(
    `insert into users (github_id, login, name, avatar_url) values ($1, $2, $3, $4)
     on conflict (github_id) do update set login = excluded.login, name = excluded.name, avatar_url = excluded.avatar_url, last_seen_at = now()
     returning id, github_id, login, name, avatar_url`,
    [gh.id, gh.login, gh.name || null, gh.avatar_url || null]);
  return rows[0];
}
export async function getUser(id) {
  const rows = await q(`select id, github_id, login, name, avatar_url from users where id = $1`, [id]);
  return rows[0] || null;
}

/* ---------- tracker documents ---------- */
// settings and profile (the behavioral interviewer's setup, including a resume), then per-item records:
// p_ coding, s_ system design, b_ behavioral, w_ worksheets
export const DOC_ID = /^(settings|profile|[psbw]_[A-Za-z0-9_.~:@+-]{1,180})$/;
export const MAX_DOC_BYTES = 300 * 1024;
export async function listDocs(uid) {
  return q(`select id, data, version, updated_at from docs where user_id = $1 order by id`, [uid]);
}
export async function putDoc(uid, id, data) {
  const rows = await q(
    `insert into docs (user_id, id, data) values ($1, $2, $3::jsonb)
     on conflict (user_id, id) do update set data = excluded.data, version = docs.version + 1, updated_at = now()
     returning version, updated_at`,
    [uid, id, JSON.stringify(data)]);
  return rows[0];
}
export async function deleteDoc(uid, id) {
  await q(`delete from docs where user_id = $1 and id = $2`, [uid, id]);
}

/* ---------- GitHub sync ---------- */
export async function getSync(uid) {
  const rows = await q(`select * from github_sync where user_id = $1`, [uid]);
  return rows[0] || null;
}
export async function saveSync(uid, s) {
  await q(
    `insert into github_sync (user_id, token_enc, scope, repo, branch) values ($1, $2, $3, $4, $5)
     on conflict (user_id) do update set token_enc = excluded.token_enc, scope = excluded.scope, repo = excluded.repo, branch = excluded.branch, last_error = null`,
    [uid, s.token_enc, s.scope || null, s.repo, s.branch || "main"]);
}
export async function updateSync(uid, fields) {
  const allowed = ["auto", "last_sync_at", "last_commit", "last_error"];
  const keys = Object.keys(fields).filter(k => allowed.includes(k));
  if (!keys.length) return;
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
  await q(`update github_sync set ${sets} where user_id = $1`, [uid, ...keys.map(k => fields[k])]);
}
export async function clearSync(uid) {
  await q(`delete from github_sync where user_id = $1`, [uid]);
}
