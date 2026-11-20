import { json, fail, session, sameOrigin } from "../lib/http.js";
import { listDocs, putDoc, deleteDoc, DOC_ID, MAX_DOC_BYTES } from "../lib/db.js";

// Your tracker records: attempts and notes per problem, worksheets, settings.
async function guard(req, write) {
  const s = session(req);
  if (!s) return [null, fail(401, "Not signed in.")];
  if (write && !sameOrigin(req)) return [null, fail(403, "Cross-site request blocked.")];
  return [s, null];
}
export async function GET(req) {
  const [s, err] = await guard(req, false); if (err) return err;
  try {
    const rows = await listDocs(s.uid);
    return json({ docs: rows.map(r => ({ id: r.id, data: r.data, version: r.version })) });
  } catch (e) { return fail(500, e.message); }
}
export async function PUT(req) {
  const [s, err] = await guard(req, true); if (err) return err;
  let body; try { body = await req.json(); } catch { return fail(400, "Send JSON with id and data."); }
  const { id, data } = body || {};
  if (typeof id !== "string" || !DOC_ID.test(id)) return fail(400, "That record id isn't allowed.");
  if (!data || typeof data !== "object" || Array.isArray(data)) return fail(400, "data must be an object.");
  if (Buffer.byteLength(JSON.stringify(data)) > MAX_DOC_BYTES) return fail(413, "That record is too large to save (over 300 KB).");
  try { const r = await putDoc(s.uid, id, data); return json({ ok: true, version: r.version }); }
  catch (e) { return fail(500, e.message); }
}
export async function DELETE(req) {
  const [s, err] = await guard(req, true); if (err) return err;
  const id = new URL(req.url).searchParams.get("id");
  if (!id || !DOC_ID.test(id)) return fail(400, "That record id isn't allowed.");
  try { await deleteDoc(s.uid, id); return json({ ok: true }); }
  catch (e) { return fail(500, e.message); }
}
