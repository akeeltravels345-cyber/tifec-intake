import { NextResponse } from "next/server";
import { getCurrentClinician } from "@/lib/auth";
import { getClinician, isContact, CLINICIANS } from "@/lib/clinicians";
import { sendTeamEmail } from "@/lib/email";
import {
  sendMessage, markThreadRead, dmThreadId, dmPartner,
  createTicket, updateTicket, getTicket,
  createNotice, deleteNotice, getNotice, updateNotice, notify, logEmail, listNotifications, markNotificationsRead,
  TICKET_AREAS, TICKET_STATUS_LABEL, type TicketArea, type TicketStatus,
} from "@/lib/comms";

const MAX_BODY = 5000;

/** Email the people an in-app notification just went to. Deliberately fire and
 *  forget: a mail outage must never fail the action that triggered it. */
async function emailTeam(userIds: string[], build: (name: string) => Parameters<typeof sendTeamEmail>[0] | null) {
  await Promise.all([...new Set(userIds)].map(async (id) => {
    const c = getClinician(id);
    const args = build(c?.name ?? id);
    if (!args) return;
    if (!c?.email) { await logEmail({ recipientId: id, recipientEmail: "", kind: args.kind, status: "skipped", detail: "no email on file" }); return; }
    let res: { sent: boolean; reason?: string };
    try { res = await sendTeamEmail({ ...args, to: c.email, recipientName: c.name }); }
    catch (e) { res = { sent: false, reason: e instanceof Error ? e.message : "send threw" }; }
    await logEmail({ recipientId: id, recipientEmail: c.email, kind: args.kind, status: res.sent ? "sent" : "failed", detail: res.reason ?? "" });
  }));
}

/** Validate an assignee list: one or more real contacts (owner / biller /
 *  admin), deduped. Returns null if it isn't usable, so a ticket can never end
 *  up with nobody responsible for it or assigned to someone arbitrary. */
function readAssignees(raw: unknown): string[] | null {
  const list = (Array.isArray(raw) ? raw : [raw]).map((x) => String(x ?? "")).filter(Boolean);
  const unique = [...new Set(list)];
  if (unique.length === 0) return null;
  if (!unique.every((id) => isContact(id))) return null;
  return unique;
}

/** Can this person post into this thread? DMs: only the two people in it.
 *  Tickets: whoever raised it, or whoever it's assigned to. */
async function canPost(threadId: string, me: string): Promise<boolean> {
  if (threadId.startsWith("dm:")) {
    const partner = dmPartner(threadId, me);
    return !!partner && dmThreadId(me, partner) === threadId && !!getClinician(partner);
  }
  if (threadId.startsWith("ticket:")) {
    const t = await getTicket(threadId.slice("ticket:".length));
    return !!t && (t.createdBy === me || t.assignees.includes(me));
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

      // Tell the other side. Never quote the message itself — see notify().
      if (threadId.startsWith("dm:")) {
        const partner = dmPartner(threadId, me.id);
        if (partner) await notify([partner], "message", `${me.name} sent you a message`, `/team/messages?to=${me.id}`);
      } else {
        const t = await getTicket(threadId.slice("ticket:".length));
        if (t) {
          const others = [t.createdBy, ...t.assignees].filter((u) => u !== me.id);
          await notify(others, "ticket_reply", `${me.name} replied on ticket #${t.ref}`, `/team/tickets/${t.id}`);
        }
      }
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
      const assignees = readAssignees(body.assignees);
      if (!assignees) return NextResponse.json({ error: "Pick at least one person this is for." }, { status: 400 });
      const subject = String(body.subject ?? "").trim();
      if (!subject) return NextResponse.json({ error: "A subject is required." }, { status: 400 });
      const area = String(body.area ?? "");
      if (!TICKET_AREAS.includes(area as TicketArea)) return NextResponse.json({ error: "Pick a subject area." }, { status: 400 });
      const text = String(body.body ?? "").trim();
      if (!text) return NextResponse.json({ error: "Describe the issue." }, { status: 400 });
      if (text.length > MAX_BODY) return NextResponse.json({ error: "That's too long." }, { status: 400 });

      const t = await createTicket({ createdBy: me.id, assignees, area: area as TicketArea, subject, body: text });
      const newFor = assignees.filter((a) => a !== me.id);
      await notify(newFor, "ticket_new",
        `${me.name} raised ticket #${t.ref} (${t.area}) for you`, `/team/tickets/${t.id}`);
      await emailTeam(newFor, () => ({
        to: "", recipientName: "", kind: "ticket_new" as const,
        actorName: me.name, ticketRef: t.ref, ticketArea: t.area, path: `/team/tickets/${t.id}`,
      }));
      return NextResponse.json({ ok: true, id: t.id, ref: t.ref });
    }

    if (action === "ticket:update") {
      const id = String(body.id ?? "");
      const t = await getTicket(id);
      if (!t) return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
      // Anyone it's assigned to owns its state; the raiser may close their own.
      if (!t.assignees.includes(me.id) && t.createdBy !== me.id) return NextResponse.json({ error: "Not your ticket." }, { status: 403 });

      const patch: { status?: TicketStatus; assignees?: string[] } = {};
      if (body.status) {
        const s = String(body.status);
        if (!["open", "in_progress", "resolved"].includes(s)) return NextResponse.json({ error: "Unknown status." }, { status: 400 });
        patch.status = s as TicketStatus;
      }
      if (body.assignees !== undefined) {
        const a = readAssignees(body.assignees);
        if (!a) return NextResponse.json({ error: "A ticket needs at least one of the owner, biller or admin." }, { status: 400 });
        patch.assignees = a;
      }
      await updateTicket(id, patch);

      if (patch.status && patch.status !== t.status) {
        const watchers = [t.createdBy, ...t.assignees].filter((u) => u !== me.id);
        await notify(watchers, "ticket_status",
          `${me.name} marked ticket #${t.ref} ${TICKET_STATUS_LABEL[patch.status].toLowerCase()}`, `/team/tickets/${t.id}`);
        // Only "resolved" is worth an email — in-progress would just be noise.
        if (patch.status === "resolved" && t.createdBy !== me.id) {
          await emailTeam([t.createdBy], () => ({
            to: "", recipientName: "", kind: "ticket_resolved" as const,
            actorName: me.name, ticketRef: t.ref, path: `/team/tickets/${t.id}`,
          }));
        }
      }
      if (patch.assignees) {
        // Only tell people newly put on it.
        const added = patch.assignees.filter((a) => !t.assignees.includes(a) && a !== me.id);
        await notify(added, "ticket_new", `${me.name} assigned ticket #${t.ref} to you`, `/team/tickets/${t.id}`);
      }
      return NextResponse.json({ ok: true });
    }

    // ---- notices ------------------------------------------------------------
    if (action === "notice:create") {
      // Company-wide announcements: the owner, the biller and the admin.
      if (!isContact(me.id)) {
        return NextResponse.json({ error: "Not allowed to post notices." }, { status: 403 });
      }
      const title = String(body.title ?? "").trim();
      if (!title) return NextResponse.json({ error: "A title is required." }, { status: 400 });
      const text = String(body.body ?? "").trim();
      if (!text) return NextResponse.json({ error: "Write the notice." }, { status: 400 });
      const eventAtRaw = String(body.eventAt ?? "").trim();
      const eventAt = eventAtRaw ? new Date(eventAtRaw).toISOString() : null;
      if (eventAtRaw && !eventAt) return NextResponse.json({ error: "That date didn't make sense." }, { status: 400 });

      const n = await createNotice({ authorId: me.id, title, body: text, eventAt, pinned: body.pinned === true });
      const others = CLINICIANS.filter((c) => c.id !== me.id).map((c) => c.id);
      await notify(others, "notice", `${me.name} posted a notice`, "/team/notices");
      await emailTeam(others, () => ({
        to: "", recipientName: "", kind: "notice" as const,
        actorName: me.name, noticeTitle: title, path: "/team/notices",
      }));
      return NextResponse.json({ ok: true, id: n.id });
    }

    // Editing/removing a notice: only the person who posted it, or an admin.
    if (action === "notice:edit" || action === "notice:delete") {
      const id = String(body.id ?? "");
      const notice = await getNotice(id);
      if (!notice) return NextResponse.json({ error: "Notice not found." }, { status: 404 });
      const isAdmin = !!getClinician(me.id)?.admin;
      if (notice.authorId !== me.id && !isAdmin) {
        return NextResponse.json({ error: "You can only edit or remove your own notices." }, { status: 403 });
      }
      if (action === "notice:delete") {
        await deleteNotice(id);
        return NextResponse.json({ ok: true });
      }
      const title = String(body.title ?? "").trim();
      if (!title) return NextResponse.json({ error: "A title is required." }, { status: 400 });
      const text = String(body.body ?? "").trim();
      if (!text) return NextResponse.json({ error: "Write the notice." }, { status: 400 });
      const eventAtRaw = String(body.eventAt ?? "").trim();
      const eventAt = eventAtRaw ? new Date(eventAtRaw).toISOString() : null;
      if (eventAtRaw && (!eventAt || eventAt === "Invalid Date")) return NextResponse.json({ error: "That date didn't make sense." }, { status: 400 });
      await updateNotice(id, { title, body: text, eventAt, pinned: body.pinned === true });
      return NextResponse.json({ ok: true });
    }

    if (action === "notifications:read") {
      await markNotificationsRead(me.id);
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

  const url = new URL(req.url);
  if (url.searchParams.get("notifications")) {
    return NextResponse.json({ ok: true, notifications: await listNotifications(me.id) });
  }

  const threadId = url.searchParams.get("thread") ?? "";
  if (!(await canPost(threadId, me.id))) return NextResponse.json({ error: "Not your conversation." }, { status: 403 });
  const { listMessages } = await import("@/lib/comms");
  const msgs = await listMessages(threadId);
  await markThreadRead(threadId, me.id);
  return NextResponse.json({ ok: true, messages: msgs });
}

export const dynamic = "force-dynamic";
