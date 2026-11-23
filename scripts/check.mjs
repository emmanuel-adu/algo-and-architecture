// `npm run build`: there's nothing to compile, so this checks that every function loads
// and exports HTTP handlers, and that the page's script parses. Needs no environment variables.
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
let failed = 0;

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p)); else if (e.name.endsWith(".js")) out.push(p);
  }
  return out;
}

for (const file of (await walk(path.join(ROOT, "api"))).sort()) {
  const rel = path.relative(ROOT, file);
  try {
    const mod = await import(pathToFileURL(file).href);
    const handlers = METHODS.filter(m => typeof mod[m] === "function");
    if (!handlers.length) throw new Error("exports no HTTP handlers");
    console.log(`ok   ${rel.padEnd(26)} ${handlers.join(", ")}`);
  } catch (e) { failed++; console.error(`FAIL ${rel}: ${e.message}`); }
}

const html = await readFile(path.join(ROOT, "public/index.html"), "utf8");
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
try {
  if (!scripts.length) throw new Error("no inline script found");
  scripts.forEach(s => new Function(s));
  console.log(`ok   public/index.html          ${scripts.length} script, ${(html.length / 1024).toFixed(0)} KB`);
} catch (e) { failed++; console.error(`FAIL public/index.html: ${e.message}`); }

// The server keeps its own copy of the behavioral question text (for the GitHub roadmap); it must match the page.
try {
  const { BH_QUESTIONS } = await import(pathToFileURL(path.join(ROOT, "lib/behavioral.js")).href);
  const block = html.slice(html.indexOf("const BH_UNITS = ["), html.indexOf("const BH = [];"));
  const page = Object.fromEntries([...block.matchAll(/\["([a-z0-9-]+)", "((?:[^"\\]|\\.)+)", "/g)].map(m => [m[1], m[2]]));
  const ids = new Set([...Object.keys(page), ...Object.keys(BH_QUESTIONS)]);
  const off = [...ids].filter(id => page[id] !== BH_QUESTIONS[id]);
  if (!Object.keys(page).length) throw new Error("no behavioral questions found in the page");
  if (off.length) throw new Error("lib/behavioral.js differs from the page for: " + off.join(", "));
  console.log(`ok   lib/behavioral.js          ${Object.keys(page).length} questions match the page`);
} catch (e) { failed++; console.error(`FAIL lib/behavioral.js: ${e.message}`); }

if (failed) { console.error(`\n${failed} check(s) failed.`); process.exit(1); }
console.log("\nBuild check passed.");
