import { NextResponse } from "next/server";
import { getBillingUser, isBiller, isOwner } from "@/lib/billingRole";
import { getClient, clinicianSeesClient, updateClient } from "@/lib/clients";
import { getDocFile, deleteDocFile } from "@/lib/clientDocs";

// Shared gate: biller/owner (any client) or a clinician linked to this client.
async function gate(id: string) {
  const user = await getBillingUser();
  if (!user) return { error: "Not signed in.", status: 401 as const };
  const client = await getClient(id);
  if (!client) return { error: "Client not found.", status: 404 as const };
  const seesAll = isBiller(user.role) || isOwner(user.role);
  if (!seesAll && !(await clinicianSeesClient(id, user.clinician.id)))
    return { error: "Not allowed.", status: 403 as const };
  return { client };
}

// Download the stored file. Streams the decrypted bytes with the right type.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const { id, docId } = await params;
  const g = await gate(id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  // The document must belong to this client's record.
  const meta = (g.client.profile.documents ?? []).find((d) => d.id === docId);
  if (!meta) return NextResponse.json({ error: "Document not found." }, { status: 404 });

  const file = await getDocFile(docId);
  if (!file || file.clientId !== id) return NextResponse.json({ error: "File is no longer available." }, { status: 404 });

  const bytes = Buffer.from(file.base64, "base64");
  // Sanitise the filename for the header (ASCII only, no quotes/newlines).
  const safeName = (meta.name || "document").replace(/[^\w.\-() ]+/g, "_").slice(0, 120);
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": file.mime || "application/octet-stream",
      "Content-Length": String(bytes.length),
      "Content-Disposition": `inline; filename="${safeName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

// Remove a document: delete its bytes and detach it from the record.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const { id, docId } = await params;
  const g = await gate(id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  await deleteDocFile(docId);
  const documents = (g.client.profile.documents ?? []).filter((d) => d.id !== docId);
  await updateClient(id, g.client.insurerId, { ...g.client.profile, documents });
  return NextResponse.json({ ok: true, documents });
}
