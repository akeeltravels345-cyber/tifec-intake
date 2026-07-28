import { NextResponse } from "next/server";
import { getBillingUser, isBiller, isOwner } from "@/lib/billingRole";
import { getClient, clinicianSeesClient, updateClient, type ClientDocument } from "@/lib/clients";
import { saveDocFile, MAX_DOC_BYTES } from "@/lib/clientDocs";
import { randomId } from "@/lib/crypto";

// Files we accept for a client document. Referral letters and clinical paperwork
// are PDFs or scans/photos; a couple of office formats are allowed too.
const ALLOWED = new Set([
  "application/pdf",
  "image/png", "image/jpeg", "image/webp", "image/gif", "image/heic", "image/heif",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

// Upload an actual file for a client (stored encrypted) and attach it to the
// record. Same access rule as editing the record: biller/owner (any client) or a
// clinician linked to this client.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getBillingUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const client = await getClient(id);
  if (!client) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  const seesAll = isBiller(user.role) || isOwner(user.role);
  if (!seesAll && !(await clinicianSeesClient(id, user.clinician.id)))
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "Invalid upload." }, { status: 400 }); }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "No file was uploaded." }, { status: 400 });
  if (file.size > MAX_DOC_BYTES) return NextResponse.json({ error: `File is too large (max ${Math.round(MAX_DOC_BYTES / 1024 / 1024)} MB). Compress it or add it as a link instead.` }, { status: 413 });

  const mime = file.type || "application/octet-stream";
  if (!ALLOWED.has(mime)) return NextResponse.json({ error: "That file type isn't supported. Upload a PDF, image, or Word document." }, { status: 415 });

  const name = s(form.get("name")) ?? file.name ?? "Document";
  const kind = s(form.get("kind")) ?? "other";

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const docId = randomId();
  await saveDocFile(docId, id, base64, mime, file.size);

  const doc: ClientDocument = {
    id: docId, name, kind, stored: true, mime, size: file.size,
    addedAt: new Date().toISOString().slice(0, 10),
  };
  const documents = [...(client.profile.documents ?? []), doc];
  await updateClient(id, client.insurerId, { ...client.profile, documents });

  return NextResponse.json({ ok: true, documents });
}
