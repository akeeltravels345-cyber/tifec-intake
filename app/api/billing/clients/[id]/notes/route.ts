import { NextResponse } from "next/server";
import { caymanToday } from "@/lib/caymanTime";
import { getBillingUser } from "@/lib/billingRole";
import { isSystemAdmin } from "@/lib/clinicians";
import { clinicianSeesClient } from "@/lib/clients";
import { addNote, updateNote, deleteNote, getNote, NOTE_FORMATS, DEFAULT_FORMAT, isNoteFormat, type NoteContent } from "@/lib/sessionNotes";
import { logChange } from "@/lib/db";

export const runtime = "nodejs";

const isDate = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
// Read the chosen format + only the fields that format defines, each capped.
const readContent = (b: Record<string, unknown>): NoteContent => {
  const format = isNoteFormat(b.format) ? b.format : DEFAULT_FORMAT;
  const src = (b.fields && typeof b.fields === "object" ? b.fields : {}) as Record<string, unknown>;
  const fields: Record<string, string> = {};
  for (const f of NOTE_FORMATS[format].fields) fields[f.key] = String(src[f.key] ?? "").slice(0, 20000);
  return { format, fields };
};
const hasContent = (c: NoteContent) => Object.values(c.fields).some((v) => v.trim());

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
  const content = readContent(body);
  if (!hasContent(content)) return NextResponse.json({ error: "Write something in the note first." }, { status: 400 });

  const note = await addNote({ clientId, clinicianId: g.user.clinician.id, sessionId: typeof body.sessionId === "string" ? body.sessionId : null, noteDate, content });
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
  const content = readContent(body);
  if (!hasContent(content)) return NextResponse.json({ error: "The note can't be empty." }, { status: 400 });

  const ok = await updateNote(noteId, { noteDate: isDate(body.noteDate) ? String(body.noteDate) : undefined, content });
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
