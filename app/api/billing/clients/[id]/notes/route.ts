import { NextResponse } from "next/server";
import { getBillingUser, isBiller, isOwner } from "@/lib/billingRole";
import { getClient, clinicianSeesClient, updateClient, type ClientNote } from "@/lib/clients";
import { randomId } from "@/lib/crypto";

// Shared client notes — visible to and addable by everyone who can open the
// record (the clinician(s), biller, owner, admin). Notes are appended server-side
// so concurrent authors never clobber each other's entries.

async function gate(id: string) {
  const user = await getBillingUser();
  if (!user) return { error: "Not signed in.", status: 401 as const };
  const client = await getClient(id);
  if (!client) return { error: "Client not found.", status: 404 as const };
  const seesAll = isBiller(user.role) || isOwner(user.role);
  if (!seesAll && !(await clinicianSeesClient(id, user.clinician.id)))
    return { error: "Not allowed.", status: 403 as const };
  return { user, client, seesAll };
}

/** Label the author's role. Owner and admin both resolve to the "owner" billing
 *  role, so the admin contact is called out separately. */
function roleLabel(g: { user: NonNullable<Awaited<ReturnType<typeof getBillingUser>>>; seesAll: boolean }): string {
  if (g.user.clinician.contact === "admin") return "admin";
  return g.user.role; // "owner" | "biller" | "clinician"
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await gate(id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ error: "Write something first." }, { status: 400 });

  const note: ClientNote = {
    id: randomId(),
    authorId: g.user.clinician.id,
    authorName: g.user.clinician.name,
    role: roleLabel(g),
    text: text.slice(0, 4000),
    addedAt: new Date().toISOString(),
  };
  const notes = [...(g.client.profile.notes ?? []), note];
  await updateClient(id, g.client.insurerId, { ...g.client.profile, notes });
  return NextResponse.json({ ok: true, notes });
}

// Delete a note. The author can remove their own; owner/admin can remove any.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await gate(id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const noteId = new URL(req.url).searchParams.get("noteId");
  if (!noteId) return NextResponse.json({ error: "Missing note." }, { status: 400 });

  const existing = g.client.profile.notes ?? [];
  const target = existing.find((n) => n.id === noteId);
  if (!target) return NextResponse.json({ error: "Note not found." }, { status: 404 });

  const isAdmin = g.user.clinician.contact === "admin" || isOwner(g.user.role);
  if (target.authorId !== g.user.clinician.id && !isAdmin)
    return NextResponse.json({ error: "Only the author, owner, or admin can delete this note." }, { status: 403 });

  const notes = existing.filter((n) => n.id !== noteId);
  await updateClient(id, g.client.insurerId, { ...g.client.profile, notes });
  return NextResponse.json({ ok: true, notes });
}
