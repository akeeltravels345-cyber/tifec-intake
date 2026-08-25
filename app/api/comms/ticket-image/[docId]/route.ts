import { getCurrentClinician } from "@/lib/auth";
import { getClinician } from "@/lib/clinicians";
import { getDocFile } from "@/lib/clientDocs";
import { getTicket, getGroup, isCustomGroup, dmPartner, GROUP_THREAD_ID } from "@/lib/comms";

export const runtime = "nodejs";

// Serve a comms attachment inline (ticket, DM, group, or team-channel message) to
// someone allowed in that thread — never a client's PHI document, even though
// they share a store.
export async function GET(_req: Request, { params }: { params: Promise<{ docId: string }> }) {
  const me = await getCurrentClinician();
  if (!me) return new Response("Unauthorized", { status: 401 });

  const { docId } = await params;
  // A read/decrypt failure (e.g. a corrupt or truncated stored blob) must return a
  // clean 404, not a 500 — so the browser shows a missing image, never a broken app.
  let file: Awaited<ReturnType<typeof getDocFile>> = null;
  try { file = await getDocFile(docId); } catch { file = null; }
  if (!file || !getClinician(me.id)) return new Response("Not found", { status: 404 });

  // The owner id is "<threadId>:msg:<mid>" for a message attachment, or bare
  // "ticket:<id>" for a ticket's first post. Strip the :msg: suffix to get the
  // thread, then check the viewer is allowed in that thread.
  const owner = file.clientId;
  const threadId = owner.replace(/:msg:[^:]+$/, "");
  let allowed = false;
  if (threadId.startsWith("ticket:")) {
    const t = await getTicket(threadId.slice("ticket:".length));
    const seesAll = me.contact === "admin" || me.contact === "owner";
    allowed = !!t && (seesAll || t.createdBy === me.id || t.assignees.includes(me.id));
  } else if (threadId === GROUP_THREAD_ID) {
    allowed = true; // team-wide channel: any signed-in member
  } else if (isCustomGroup(threadId)) {
    const g = await getGroup(threadId);
    allowed = !!g && g.memberIds.includes(me.id);
  } else if (threadId.startsWith("dm:")) {
    const partner = dmPartner(threadId, me.id);
    allowed = !!partner && [me.id, partner].sort().join("|") === threadId.slice(3);
  }
  if (!allowed) return new Response("Forbidden", { status: 403 });

  const bytes = Buffer.from(file.base64, "base64");
  const headers: Record<string, string> = {
    "Content-Type": file.mime || "application/octet-stream",
    "Content-Length": String(bytes.length),
    "Cache-Control": "private, max-age=3600",
  };
  // Serve inline (images/PDFs open in the tab); attach the original filename so a
  // download keeps a sensible name. HTTP header values must be ASCII, but real
  // filenames aren't — macOS screenshots contain a narrow no-break space (U+202F),
  // and others carry accents/unicode. So give an ASCII-safe `filename` plus an
  // RFC 5987 `filename*` with the true UTF-8 name.
  if (file.name) {
    const ascii = file.name.slice(0, 200).replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "'");
    headers["Content-Disposition"] = `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.name.slice(0, 200))}`;
  }
  // Belt and suspenders: a stray header value must never 500 an image request.
  try {
    return new Response(bytes, { headers });
  } catch {
    return new Response(bytes, { headers: { "Content-Type": file.mime || "application/octet-stream", "Content-Length": String(bytes.length), "Cache-Control": "private, max-age=3600" } });
  }
}
