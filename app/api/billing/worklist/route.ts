import { NextResponse } from "next/server";
import { getBillingUser, isBiller, isOwner } from "@/lib/billingRole";
import { addFeature, setFeatureStatus, setFeaturePriority, addFeatureNote, type Attachment, type FeatureStatus, type Priority } from "@/lib/worklist";
import { saveDocFile, MAX_DOC_BYTES } from "@/lib/clientDocs";
import { randomId } from "@/lib/crypto";

export const runtime = "nodejs";

// Act on an existing feature: change status, change priority, or add a note
// (a clarification question or a reply). Open to owner / biller / admin.
export async function PATCH(req: Request) {
  const user = await getBillingUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const allowed = isOwner(user.role) || isBiller(user.role) || user.clinician.contact === "admin";
  if (!allowed) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  let body: { id?: string; action?: string; status?: string; priority?: string; text?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  const id = (body.id || "").trim();
  if (!id) return NextResponse.json({ error: "Missing feature id." }, { status: 400 });

  let ok = false;
  if (body.action === "status" && ["open", "in_progress", "done"].includes(String(body.status))) {
    ok = await setFeatureStatus(id, body.status as FeatureStatus);
  } else if (body.action === "priority" && ["nice", "important", "urgent"].includes(String(body.priority))) {
    ok = await setFeaturePriority(id, body.priority as Priority);
  } else if (body.action === "note") {
    const text = (body.text || "").trim().slice(0, 1500);
    if (!text) return NextResponse.json({ error: "Write a note first." }, { status: 400 });
    ok = await addFeatureNote(id, user.clinician.id, text);
  } else {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  if (!ok) return NextResponse.json({ error: "Could not update — feature not found?" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

interface IncomingAttachment { name?: string; mime?: string; kind?: string; base64?: string; }

// Add a feature request to the shared worklist. Open to the owner, the biller,
// and the system admin (Akeel) — the people who collaborate on the build.
export async function POST(req: Request) {
  const user = await getBillingUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const allowed = isOwner(user.role) || isBiller(user.role) || user.clinician.contact === "admin";
  if (!allowed) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  let body: { name?: string; description?: string; flowStart?: string; flowEnd?: string; priority?: string; attachments?: IncomingAttachment[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const name = (body.name || "").trim();
  if (!name) return NextResponse.json({ error: "Give the feature a name." }, { status: 400 });

  const start = (body.flowStart || "").trim();
  const end = (body.flowEnd || "").trim();
  const flow = start || end ? `${start || "?"} → ${end || "?"}` : "";

  // Store any attached files / voice notes (base64) in the shared doc store,
  // keeping only lightweight pointers on the feature.
  const incoming: IncomingAttachment[] = Array.isArray(body.attachments) ? body.attachments.slice(0, 6) : [];
  const attachments: Attachment[] = [];
  for (const a of incoming) {
    const base64 = typeof a.base64 === "string" ? a.base64 : "";
    if (!base64) continue;
    const size = Math.floor((base64.length * 3) / 4);
    if (size > MAX_DOC_BYTES) return NextResponse.json({ error: "A file is too large (max 4 MB)." }, { status: 400 });
    const kind = a.kind === "voice" ? "voice" : "file";
    const mime = (a.mime || (kind === "voice" ? "audio/webm" : "application/octet-stream")).slice(0, 80);
    const nm = (a.name || (kind === "voice" ? "Voice note" : "Attachment")).slice(0, 120);
    const docId = randomId();
    try {
      await saveDocFile(docId, `worklist:${user.clinician.id}`, base64, mime, size);
      attachments.push({ docId, name: nm, mime, kind });
    } catch (err) {
      console.error("worklist attachment save failed:", err);
    }
  }

  try {
    await addFeature(user.clinician.id, {
      name: name.slice(0, 120),
      description: (body.description || "").slice(0, 2000),
      flow: flow.slice(0, 400),
      priority: String(body.priority || "nice"),
      attachments,
    });
  } catch (err) {
    console.error("worklist add failed:", err);
    return NextResponse.json({ error: "Could not save. Try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
