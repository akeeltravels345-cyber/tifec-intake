import { getBillingUser, isBiller, isOwner } from "@/lib/billingRole";
import { getDocFile } from "@/lib/clientDocs";

export const runtime = "nodejs";

// Serve a worklist attachment / voice note inline (for <audio>, <img>, download).
// Only files tagged "worklist:*" are served here — never a client's PHI document,
// even though they share the same underlying store.
export async function GET(_req: Request, { params }: { params: Promise<{ docId: string }> }) {
  const user = await getBillingUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const allowed = isOwner(user.role) || isBiller(user.role) || user.clinician.contact === "admin";
  if (!allowed) return new Response("Forbidden", { status: 403 });

  const { docId } = await params;
  const file = await getDocFile(docId);
  if (!file || !file.clientId.startsWith("worklist:")) return new Response("Not found", { status: 404 });

  const bytes = Buffer.from(file.base64, "base64");
  return new Response(bytes, {
    headers: {
      "Content-Type": file.mime || "application/octet-stream",
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
