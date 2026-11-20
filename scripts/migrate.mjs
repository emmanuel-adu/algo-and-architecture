// Creates the app's tables. Uses the direct (unpooled) connection when it's available,
// as Neon recommends for schema changes; falls back to DATABASE_URL.
// Run with: npm run db:migrate   (reads .env.local after `neon env pull`)
import pg from "pg";
import { SCHEMA } from "../lib/db.js";

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error("No database URL. Run `neon env pull` first, or set DATABASE_URL_UNPOOLED or DATABASE_URL.");
  process.exit(1);
}
const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 15000 });
try {
  await client.connect();
  const host = new URL(url).hostname;
  console.log(`Connected to ${host} (${process.env.DATABASE_URL_UNPOOLED ? "direct" : "DATABASE_URL"})`);
  await client.query("begin");
  for (const s of SCHEMA) await client.query(s);
  await client.query("commit");
  const { rows } = await client.query(
    "select table_name from information_schema.tables where table_schema = 'public' and table_name = any($1) order by table_name",
    [["users", "docs", "github_sync"]]
  );
  console.log("Tables ready:", rows.map(r => r.table_name).join(", "));
} catch (e) {
  await client.query("rollback").catch(() => {});
  console.error("Migration failed:", e.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
