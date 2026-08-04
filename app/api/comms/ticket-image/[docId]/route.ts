import { getCurrentClinician } from "@/lib/auth";
import { getClinician } from "@/lib/clinicians";
import { getDocFile } from "@/lib/clientDocs";
import { getTicket } from "@/lib/comms";

export const runtime = "nodejs";

// Serve a ticket image inline. Only files tagged "ticket:<id>" are served here,
// and only to someone who can see that ticket (its creator, an assignee, or an
// admin/owner) — never a client's PHI document, even though they share a store.
export async function GET(_req: Request, { params }: { params: Promise<{ docId: string }> }) {
  const me = await getCurrentClinician();
  if (!me) return new Response("Unauthorized", { status: 401 });

  const { docId } = await params;
  const file = await getDocFile(docId);
  if (!file || !file.clientId.startsWith("ticket:")) return new Response("Not found", { status: 404 });

  const ticketId = file.clientId.slice("ticket:".length);
  const t = await getTicket(ticketId);
  const seesAll = me.contact === "admin" || me.contact === "owner";
  const allowed = !!t && (seesAll || t.createdBy === me.id || t.assignees.includes(me.id));
  if (!allowed || !getClinician(me.id)) return new Response("Forbidden", { status: 403 });

  const bytes = Buffer.from(file.base64, "base64");
  return new Response(bytes, {
    headers: {
      "Content-Type": file.mime || "application/octet-stream",
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
