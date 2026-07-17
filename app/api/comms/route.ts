import { NextResponse } from "next/server";
import { getCurrentClinician } from "@/lib/auth";
import { getClinician, isContact } from "@/lib/clinicians";
import {
  sendMessage, markThreadRead, dmThreadId, dmPartner,
  createTicket, updateTicket, getTicket,
  createNotice, deleteNotice,
  TICKET_AREAS, type TicketArea, type TicketStatus,
} from "@/lib/comms";

const MAX_BODY = 5000;

/** Can this person post into this thread? DMs: only the two people in it.
 *  Tickets: whoever raised it, or whoever it's assigned to. */
async function canPost(threadId: string, me: string): Promise<boolean> {
  if (threadId.startsWith("dm:")) {
    const partner = dmPartner(threadId, me);
    return !!partner && dmThreadId(me, partner) === threadId && !!getClinician(partner);
  }
  if (threadId.startsWith("ticket:")) {
    const t = await getTicket(threadId.slice("ticket:".length));
    return !!t && (t.createdBy === me || t.assignee === me);
  }
  return false;
}

export async function POST(req: Request) {
  const me = await getCurrentClinician();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const action = String(body.action ?? "");

  try {
    // ---- messages + ticket replies -----------------------------------------
    if (action === "send") {
      const threadId = String(body.threadId ?? "");
      const text = String(body.body ?? "").trim();
      if (!text) return NextResponse.json({ error: "Write something first." }, { status: 400 });
      if (text.length > MAX_BODY) return NextResponse.json({ error: "That message is too long." }, { status: 400 });
      if (!(await canPost(threadId, me.id))) return NextResponse.json({ error: "Not your conversation." }, { status: 403 });
      const m = await sendMessage(threadId, me.id, text);
      return NextResponse.json({ ok: true, id: m.id });
    }

    if (action === "read") {
      const threadId = String(body.threadId ?? "");
      if (!(await canPost(threadId, me.id))) return NextResponse.json({ error: "Not your conversation." }, { status: 403 });
      await markThreadRead(threadId, me.id);
      return NextResponse.json({ ok: true });
    }

    // ---- tickets ------------------------------------------------------------
    if (action === "ticket:create") {
      const assignee = String(body.assignee ?? "");
      // Tickets go to a contact (owner / biller / admin), not to anyone at all.
      if (!isContact(assignee)) return NextResponse.json({ error: "Pick who this is for." }, { status: 400 });
      const subject = String(body.subject ?? "").trim();
      if (!subject) return NextResponse.json({ error: "A subject is required." }, { status: 400 });
      const area = String(body.area ?? "");
      if (!TICKET_AREAS.includes(area as TicketArea)) return NextResponse.json({ error: "Pick a subject area." }, { status: 400 });
      const text = String(body.body ?? "").trim();
      if (!text) return NextResponse.json({ error: "Describe the issue." }, { status: 400 });
      if (text.length > MAX_BODY) return NextResponse.json({ error: "That's too long." }, { status: 400 });

      const t = await createTicket({ createdBy: me.id, assignee, area: area as TicketArea, subject, body: text });
      return NextResponse.json({ ok: true, id: t.id, ref: t.ref });
    }

    if (action === "ticket:update") {
      const id = String(body.id ?? "");
      const t = await getTicket(id);
      if (!t) return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
      // The person it's assigned to owns its state; the raiser may close their own.
      if (t.assignee !== me.id && t.createdBy !== me.id) return NextResponse.json({ error: "Not your ticket." }, { status: 403 });

      const patch: { status?: TicketStatus; assignee?: string } = {};
      if (body.status) {
        const s = String(body.status);
        if (!["open", "in_progress", "resolved"].includes(s)) return NextResponse.json({ error: "Unknown status." }, { status: 400 });
        patch.status = s as TicketStatus;
      }
      if (body.assignee) {
        const a = String(body.assignee);
        if (!isContact(a)) return NextResponse.json({ error: "Can only reassign to the owner, biller or admin." }, { status: 400 });
        patch.assignee = a;
      }
      await updateTicket(id, patch);
      return NextResponse.json({ ok: true });
    }

    // ---- notices ------------------------------------------------------------
    if (action === "notice:create") {
      // Company-wide announcements: the owner and the admin only.
      if (me.contact !== "owner" && me.contact !== "admin") {
        return NextResponse.json({ error: "Only the owner or admin can post a notice." }, { status: 403 });
      }
      const title = String(body.title ?? "").trim();
      if (!title) return NextResponse.json({ error: "A title is required." }, { status: 400 });
      const text = String(body.body ?? "").trim();
      if (!text) return NextResponse.json({ error: "Write the notice." }, { status: 400 });
      const eventAtRaw = String(body.eventAt ?? "").trim();
      const eventAt = eventAtRaw ? new Date(eventAtRaw).toISOString() : null;
      if (eventAtRaw && !eventAt) return NextResponse.json({ error: "That date didn't make sense." }, { status: 400 });

      const n = await createNotice({ authorId: me.id, title, body: text, eventAt, pinned: body.pinned === true });
      return NextResponse.json({ ok: true, id: n.id });
    }

    if (action === "notice:delete") {
      if (me.contact !== "owner" && me.contact !== "admin") {
        return NextResponse.json({ error: "Not allowed." }, { status: 403 });
      }
      await deleteNotice(String(body.id ?? ""));
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

// Used by the thread view to poll for new messages without a full reload.
export async function GET(req: Request) {
  const me = await getCurrentClinician();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const threadId = new URL(req.url).searchParams.get("thread") ?? "";
  if (!(await canPost(threadId, me.id))) return NextResponse.json({ error: "Not your conversation." }, { status: 403 });
  const { listMessages } = await import("@/lib/comms");
  const msgs = await listMessages(threadId);
  await markThreadRead(threadId, me.id);
  return NextResponse.json({ ok: true, messages: msgs });
}

export const dynamic = "force-dynamic";
