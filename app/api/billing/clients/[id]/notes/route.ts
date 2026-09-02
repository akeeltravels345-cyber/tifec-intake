import { NextResponse } from "next/server";
import { caymanToday } from "@/lib/caymanTime";
import { getBillingUser } from "@/lib/billingRole";
import { isSystemAdmin } from "@/lib/clinicians";
import { clinicianSeesClient } from "@/lib/clients";
import { addNote, updateNote, deleteNote, getNote, type Soap } from "@/lib/sessionNotes";
import { logChange } from "@/lib/db";

export const runtime = "nodejs";

const isDate = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const readSoap = (b: Record<string, unknown>): Soap => ({
  s: String(b.s ?? "").slice(0, 20000), o: String(b.o ?? "").slice(0, 20000),
  a: String(b.a ?? "").slice(0, 20000), p: String(b.p ?? "").slice(0, 20000),
});
const hasContent = (s: Soap) => !!(s.s.trim() || s.o.trim() || s.a.trim() || s.p.trim());

// Only a clinician LINKED to THIS client may read or write its notes (PHI).
// Access follows the treating relationship, not the billing role: a biller who
// is also a practicum clinician sees their own clients' notes; a pure biller
// (never linked as a clinician) does not. The oversight admin never sees notes.
async function gate(clientId: string) {
  const user = await getBillingUser();
  if (!user) return { error: NextResponse.json({ error: "Not signed in." }, { status: 401 }) };
  if (isSystemAdmin(user.clinician)) return { error: NextResponse.json({ error: "Not allowed." }, { status: 403 }) };
  if (!(await clinicianSeesClient(clientId, user.clinician.id))) return { error: NextResponse.json({ error: "Not your client." }, { status: 403 }) };
  return { user };
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await params;
  const g = await gate(clientId);
  if (g.error) return g.error;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const noteDate = isDate(body.noteDate) ? String(body.noteDate) : caymanToday();
  const soap = readSoap(body);
  if (!hasContent(soap)) return NextResponse.json({ error: "Write something in the note first." }, { status: 400 });

  const note = await addNote({ clientId, clinicianId: g.user.clinician.id, sessionId: typeof body.sessionId === "string" ? body.sessionId : null, noteDate, soap });
  await logChange(g.user.clinician.id, `client:${clientId}`, "notes", "added a session note");
  return NextResponse.json({ ok: true, id: note.id });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await params;
  const g = await gate(clientId);
  if (g.error) return g.error;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const noteId = String(body.noteId ?? "");
  const note = await getNote(noteId);
  if (!note || note.clientId !== clientId) return NextResponse.json({ error: "Note not found." }, { status: 404 });
  // Only the author may edit their own note.
  if (note.clinicianId !== g.user.clinician.id) return NextResponse.json({ error: "You can only edit your own notes." }, { status: 403 });
  const soap = readSoap(body);
  if (!hasContent(soap)) return NextResponse.json({ error: "The note can't be empty." }, { status: 400 });

  const ok = await updateNote(noteId, { noteDate: isDate(body.noteDate) ? String(body.noteDate) : undefined, soap });
  if (!ok) return NextResponse.json({ error: "Could not save." }, { status: 500 });
  await logChange(g.user.clinician.id, `client:${clientId}`, "notes", "edited a session note");
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await params;
  const g = await gate(clientId);
  if (g.error) return g.error;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const noteId = String(body.noteId ?? "");
  const note = await getNote(noteId);
  if (!note || note.clientId !== clientId) return NextResponse.json({ error: "Note not found." }, { status: 404 });
  if (note.clinicianId !== g.user.clinician.id) return NextResponse.json({ error: "You can only delete your own notes." }, { status: 403 });
  await deleteNote(noteId);
  await logChange(g.user.clinician.id, `client:${clientId}`, "notes", "deleted a session note");
  return NextResponse.json({ ok: true });
}
