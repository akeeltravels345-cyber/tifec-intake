import { NextResponse } from "next/server";
import { getBillingUser, isBiller, isOwner } from "@/lib/billingRole";
import { isSystemAdmin } from "@/lib/clinicians";
import { getClient, clinicianSeesClient, addClientNote, deleteClientNote } from "@/lib/clients";
import { logChange } from "@/lib/db";

export const dynamic = "force-dynamic";

// Shared "team notes" on a client: benefits, authorisations, reminders (e.g. a
// referral renewal coming up) the whole team can see. Anyone who can view the
// client can add one; the author or an owner/admin can delete.
async function whoAndAccess(id: string) {
  const user = await getBillingUser();
  if (!user) return { error: NextResponse.json({ error: "Not signed in." }, { status: 401 }) } as const;
  const client = await getClient(id);
  if (!client) return { error: NextResponse.json({ error: "Client not found." }, { status: 404 }) } as const;
  const seesAll = isBiller(user.role) || isOwner(user.role) || isSystemAdmin(user.clinician);
  const canView = seesAll || (await clinicianSeesClient(id, user.clinician.id));
  if (!canView) return { error: NextResponse.json({ error: "Not allowed." }, { status: 403 }) } as const;
  const isAdmin = isSystemAdmin(user.clinician);
  const canModerate = isOwner(user.role) || isAdmin;
  const role = isAdmin ? "admin" : user.role;
  return { user, canModerate, role } as const;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await whoAndAccess(id);
  if ("error" in a) return a.error;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ error: "Write something first." }, { status: 400 });

  const notes = await addClientNote(id, { authorId: a.user.clinician.id, authorName: a.user.clinician.name, role: a.role, text });
  if (!notes) return NextResponse.json({ error: "Could not add note." }, { status: 500 });
  await logChange(a.user.clinician.id, `client:${id}`, "status", "added a team note");
  return NextResponse.json({ ok: true, notes });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await whoAndAccess(id);
  if ("error" in a) return a.error;

  const noteId = new URL(req.url).searchParams.get("noteId") ?? "";
  if (!noteId) return NextResponse.json({ error: "Missing note." }, { status: 400 });

  // Only the author or a moderator (owner/admin) can delete.
  const client = await getClient(id);
  const target = client?.profile.notes?.find((n) => n.id === noteId);
  if (target && target.authorId !== a.user.clinician.id && !a.canModerate) {
    return NextResponse.json({ error: "Only the note's author or an owner can delete it." }, { status: 403 });
  }
  const notes = await deleteClientNote(id, noteId);
  if (!notes) return NextResponse.json({ error: "Could not remove note." }, { status: 500 });
  await logChange(a.user.clinician.id, `client:${id}`, "status", "removed a team note");
  return NextResponse.json({ ok: true, notes });
}
