import { NextResponse } from "next/server";
import { getCurrentClinician } from "@/lib/auth";
import { getClinician, isContact, isSystemAdmin, CLINICIANS } from "@/lib/clinicians";
import { sendTeamEmail } from "@/lib/email";
import { saveDocFile, MAX_DOC_BYTES, deleteDocFilesByPrefix, listDocMetaByPrefix } from "@/lib/clientDocs";
import { randomId } from "@/lib/crypto";
import {
  sendMessage, markThreadRead, dmThreadId, dmPartner, ticketThreadId, GROUP_THREAD_ID, touchPresence, claimEmailWindow,
  isCustomGroup, getGroup, createGroup, setGroupMembers, renameGroup, deleteGroup,
  createTicket, updateTicket, deleteTicket, getTicket,
  createNotice, deleteNotice, getNotice, updateNotice, acknowledgeNotice, notify, logEmail, listNotifications, markNotificationsRead,
  TICKET_AREAS, isTicketStatus, type TicketArea, type TicketStatus,
} from "@/lib/comms";

const MAX_BODY = 5000;

// What can be attached to a ticket: images, voice notes, and common document
// files (PDF, Word, Excel, text). Anything else is rejected.
const ATTACH_DOC_MIMES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain", "text/csv",
]);
const attachAllowed = (mime: string) => mime.startsWith("image/") || mime.startsWith("audio/") || ATTACH_DOC_MIMES.has(mime);
/** Persist one attachment (base64) under an owner id, if it's an allowed type and
 *  within the size cap. Returns true if saved. */
async function saveAttachment(owner: string, a: { base64?: string; mime?: string; name?: string }): Promise<boolean> {
  const base64 = typeof a.base64 === "string" ? a.base64 : "";
  if (!base64) return false;
  const size = Math.floor((base64.length * 3) / 4);
  if (size > MAX_DOC_BYTES) return false;
  const mime = (a.mime || "application/octet-stream").slice(0, 80);
  if (!attachAllowed(mime)) return false;
  const name = typeof a.name === "string" && a.name.trim() ? a.name.trim().slice(0, 200) : null;
  try { await saveDocFile(randomId(), owner, base64, mime, size, name); return true; }
  catch (e) { console.error("attachment save failed", e); return false; }
}

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

/** Validate an assignee list: one or more real team members, deduped. Anyone
 *  on the team can be added to a ticket now (not just owner/biller/admin), but
 *  every id must be a real clinician so a ticket is never assigned to nobody or
 *  to someone arbitrary. */
function readAssignees(raw: unknown): string[] | null {
  const list = (Array.isArray(raw) ? raw : [raw]).map((x) => String(x ?? "")).filter(Boolean);
  const unique = [...new Set(list)];
  if (unique.length === 0) return null;
  if (!unique.every((id) => !!getClinician(id))) return null;
  return unique;
}

/** Can this person post into this thread? DMs: only the two people in it.
 *  Tickets: whoever raised it, or whoever it's assigned to. */
async function canPost(threadId: string, me: string): Promise<boolean> {
  // The team-wide channel: any signed-in team member may post and read.
  if (threadId === GROUP_THREAD_ID) return !!getClinician(me);
  // A custom group: only its members.
  if (isCustomGroup(threadId)) {
    const g = await getGroup(threadId);
    return !!g && g.memberIds.includes(me);
  }
  if (threadId.startsWith("dm:")) {
    const partner = dmPartner(threadId, me);
    return !!partner && dmThreadId(me, partner) === threadId && !!getClinician(partner);
  }
  if (threadId.startsWith("ticket:")) {
    const t = await getTicket(threadId.slice("ticket:".length));
    if (!t) return false;
    // The raiser and assignees are on the ticket; the admin/owner oversee every
    // ticket, so they can comment too (matching who can view it).
    const c = getClinician(me);
    const seesAll = c?.contact === "admin" || c?.contact === "owner";
    return seesAll || t.createdBy === me || t.assignees.includes(me);
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
      // Any thread (DM, group, team channel, ticket) may carry image / voice / file attachments.
      const atts: { base64?: string; mime?: string; name?: string }[] = Array.isArray(body.attachments) ? (body.attachments as []).slice(0, 6) : [];
      if (!text && atts.length === 0) return NextResponse.json({ error: "Write something, or add an image, file or voice note." }, { status: 400 });
      if (text.length > MAX_BODY) return NextResponse.json({ error: "That message is too long." }, { status: 400 });
      if (!(await canPost(threadId, me.id))) return NextResponse.json({ error: "Not your conversation." }, { status: 403 });
      const m = await sendMessage(threadId, me.id, text);
      // Save each attachment against this specific comment: owner id
      // "ticket:<id>:msg:<messageId>" so the detail page can show it under the
      // right comment. Same encrypted doc store as the ticket's own screenshots.
      for (const a of atts) await saveAttachment(`${threadId}:msg:${m.id}`, a);

      // Tell the other side. Never quote the message itself — see notify().
      if (threadId === GROUP_THREAD_ID) {
        // Team channel: nudge everyone else in-app (no email — that'd be noisy).
        const team = CLINICIANS.filter((c) => (!c.intakeHidden || isContact(c.id)) && c.id !== me.id).map((c) => c.id);
        await notify(team, "message", `${me.name} posted in the team channel`, `/team/messages?to=all`);
      } else if (isCustomGroup(threadId)) {
        // A custom group: nudge the other members in-app.
        const g = await getGroup(threadId);
        if (g) {
          const others = g.memberIds.filter((u) => u !== me.id);
          await notify(others, "message", `${me.name} posted in ${g.name}`, `/team/messages?to=${threadId}`);
        }
      } else if (threadId.startsWith("dm:")) {
        const partner = dmPartner(threadId, me.id);
        if (partner) await notify([partner], "message", `${me.name} sent you a message`, `/team/messages?to=${me.id}`);
      } else {
        const t = await getTicket(threadId.slice("ticket:".length));
        if (t) {
          const others = [...new Set([t.createdBy, ...t.assignees])].filter((u) => u !== me.id);
          await notify(others, "ticket_reply", `${me.name} replied on ticket #${t.ref}`, `/team/tickets/${t.id}`);
          // Comments email too, but throttled: once someone's been emailed about
          // this ticket, hold off for 30 min so a back-and-forth isn't one email
          // per message. In-app notifications above still fire every time.
          const dueReply = await claimEmailWindow(threadId, others);
          if (dueReply.length) await emailTeam(dueReply, () => ({
            to: "", recipientName: "", kind: "ticket_reply" as const,
            actorName: me.name, ticketRef: t.ref, path: `/team/tickets/${t.id}`,
          }));
          // Auto-progress the status so it stays honest without anyone remembering
          // to change it: the first reply from the assignee side starts a "Not
          // started" ticket; the raiser answering a "Needs info" ticket resumes it.
          const isRaiser = me.id === t.createdBy;
          const nextStatus: TicketStatus | null =
            !isRaiser && t.status === "open" ? "in_progress"
            : isRaiser && t.status === "needs_info" ? "in_progress"
            : null;
          if (nextStatus) await updateTicket(t.id, { status: nextStatus });
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

    // Create a custom group chat: a name + chosen members (the creator is always
    // included). Any signed-in team member may start one.
    if (action === "group:create") {
      const name = String(body.name ?? "").trim().slice(0, 80);
      if (!name) return NextResponse.json({ error: "Give the group a name." }, { status: 400 });
      const picked = Array.isArray(body.memberIds) ? body.memberIds.map(String) : [];
      // Keep only real team members other than the creator; need at least one.
      const members = [...new Set(picked)].filter((id) => id !== me.id && !!getClinician(id));
      if (members.length === 0) return NextResponse.json({ error: "Add at least one other person." }, { status: 400 });
      const g = await createGroup(name, members, me.id);
      await notify(members, "message", `${me.name} added you to ${g.name}`, `/team/messages?to=${g.threadId}`);
      return NextResponse.json({ ok: true, threadId: g.threadId });
    }

    // Manage a group's members / name. Must be a member. Adding people and
    // renaming are open to any member; removing someone else is limited to the
    // creator or an owner/admin. Anyone can leave.
    if (action === "group:addMembers" || action === "group:removeMember" || action === "group:rename" || action === "group:leave") {
      const threadId = String(body.threadId ?? "");
      const g = await getGroup(threadId);
      if (!g) return NextResponse.json({ error: "Group not found." }, { status: 404 });
      if (!g.memberIds.includes(me.id)) return NextResponse.json({ error: "You're not in this group." }, { status: 403 });
      const mc = getClinician(me.id);
      const canModerate = g.createdBy === me.id || mc?.contact === "owner" || (mc ? isSystemAdmin(mc) : false);

      if (action === "group:addMembers") {
        const picked = (Array.isArray(body.memberIds) ? body.memberIds.map(String) : []).filter((id: string) => !!getClinician(id) && !g.memberIds.includes(id));
        if (picked.length === 0) return NextResponse.json({ error: "Pick someone to add." }, { status: 400 });
        await setGroupMembers(threadId, [...g.memberIds, ...picked]);
        await notify(picked, "message", `${me.name} added you to ${g.name}`, `/team/messages?to=${threadId}`);
        return NextResponse.json({ ok: true });
      }

      if (action === "group:rename") {
        const name = String(body.name ?? "").trim().slice(0, 80);
        if (!name) return NextResponse.json({ error: "Give the group a name." }, { status: 400 });
        await renameGroup(threadId, name);
        return NextResponse.json({ ok: true });
      }

      // Leave = remove self; removeMember = remove someone else (moderators only).
      const target = action === "group:leave" ? me.id : String(body.memberId ?? "");
      if (!target || !g.memberIds.includes(target)) return NextResponse.json({ error: "Not a member." }, { status: 400 });
      if (target !== me.id && !canModerate) return NextResponse.json({ error: "Only the group's creator or an owner can remove people." }, { status: 403 });
      const remaining = g.memberIds.filter((id) => id !== target);
      // Last person out: retire the group so it doesn't linger unreachable.
      if (remaining.length === 0) await deleteGroup(threadId);
      else await setGroupMembers(threadId, remaining);
      return NextResponse.json({ ok: true, left: target === me.id, deleted: remaining.length === 0 });
    }

    // Presence heartbeat: keep the user "online" while a tab is open.
    if (action === "ping") {
      await touchPresence(me.id);
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

      // Raising on someone's behalf: when a colleague calls/messages and the
      // admin or owner logs it for them, the ticket is FROM that person (so
      // updates and the resolution reach them) and entered_by records who typed
      // it. Only the admin/owner may attribute a ticket to someone else.
      const mc = getClinician(me.id);
      const canDelegate = mc?.contact === "admin" || mc?.contact === "owner";
      const reportedBy = typeof body.reportedBy === "string" ? body.reportedBy : "";
      const onBehalf = canDelegate && reportedBy && reportedBy !== me.id && !!getClinician(reportedBy);
      const createdBy = onBehalf ? reportedBy : me.id;
      const enteredBy = onBehalf ? me.id : null;

      const t = await createTicket({ createdBy, enteredBy, assignees, area: area as TicketArea, subject, body: text });
      // Optional attachments (screenshots, PDFs, documents) — stored in the shared
      // encrypted doc store under owner id "ticket:<id>". Accepts `images` (legacy)
      // and `attachments`.
      const raw = [
        ...(Array.isArray(body.images) ? (body.images as []) : []),
        ...(Array.isArray(body.attachments) ? (body.attachments as []) : []),
      ].slice(0, 8);
      for (const a of raw) await saveAttachment(`ticket:${t.id}`, a);
      const newFor = assignees.filter((a) => a !== me.id);
      await notify(newFor, "ticket_new",
        `${me.name} raised ticket #${t.ref} (${t.area}) for you`, `/team/tickets/${t.id}`);
      // Logged on someone's behalf: tell the person it's from that it's on record,
      // so they know their call/message became a tracked ticket.
      if (onBehalf) {
        await notify([createdBy], "ticket_new",
          `${me.name} logged your issue as ticket #${t.ref} (${t.area})`, `/team/tickets/${t.id}`);
      }
      // First email of the thread; also opens the 30-min throttle window so an
      // immediate follow-up comment doesn't send a second email.
      const dueNew = await claimEmailWindow(ticketThreadId(t.id), newFor);
      if (dueNew.length) await emailTeam(dueNew, () => ({
        to: "", recipientName: "", kind: "ticket_new" as const,
        actorName: me.name, ticketRef: t.ref, ticketArea: t.area, path: `/team/tickets/${t.id}`,
      }));
      return NextResponse.json({ ok: true, id: t.id, ref: t.ref });
    }

    if (action === "ticket:update") {
      const id = String(body.id ?? "");
      const t = await getTicket(id);
      if (!t) return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
      // Anyone it's assigned to owns its state; the raiser may close their own;
      // the admin/owner oversee every ticket.
      const mc = getClinician(me.id);
      const oversees = mc?.contact === "admin" || mc?.contact === "owner";
      if (!oversees && !t.assignees.includes(me.id) && t.createdBy !== me.id) return NextResponse.json({ error: "Not your ticket." }, { status: 403 });

      const patch: { status?: TicketStatus; assignees?: string[] } = {};
      if (body.status) {
        const s = String(body.status);
        if (!isTicketStatus(s)) return NextResponse.json({ error: "Unknown status." }, { status: 400 });
        patch.status = s;
      }
      if (body.assignees !== undefined) {
        const a = readAssignees(body.assignees);
        if (!a) return NextResponse.json({ error: "A ticket needs at least one of the owner, biller or admin." }, { status: 400 });
        patch.assignees = a;
      }
      await updateTicket(id, patch);

      if (patch.status && patch.status !== t.status) {
        const watchers = [t.createdBy, ...t.assignees].filter((u) => u !== me.id);
        const ref = `#${t.ref}`;
        const msg =
          patch.status === "resolved" ? `${me.name} marked ${ref} done`
          : patch.status === "needs_info" ? `${me.name} needs more info on ${ref}`
          : patch.status === "on_hold" ? `${me.name} put ${ref} on hold`
          : patch.status === "in_progress" ? `${me.name} is now working on ${ref}`
          : `${me.name} reopened ${ref}`;
        await notify(watchers, "ticket_status", msg, `/team/tickets/${t.id}`);
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

    if (action === "ticket:delete") {
      const id = String(body.id ?? "");
      const t = await getTicket(id);
      if (!t) return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
      // Deleting removes the ticket for everyone, so only the admin/owner may.
      const c = getClinician(me.id);
      if (!(c?.contact === "admin" || c?.contact === "owner")) return NextResponse.json({ error: "Only an admin or owner can delete a ticket." }, { status: 403 });
      await deleteTicket(id);
      await deleteDocFilesByPrefix(`ticket:${id}`);
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

      const n = await createNotice({ authorId: me.id, title, body: text, eventAt, pinned: body.pinned === true, askAck: body.askAck === true });
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
      const isAdmin = isSystemAdmin(getClinician(me.id));
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

    // Acknowledge a notice ("Got it" / "I'll be there"). Any signed-in person.
    if (action === "notice:ack") {
      const id = String(body.id ?? "");
      if (!id) return NextResponse.json({ error: "Which notice?" }, { status: 400 });
      const response = String(body.response ?? "Got it").trim() || "Got it";
      await acknowledgeNotice(id, me.id, response);
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
  // Attach each message's files so the live poll shows images / voice notes too.
  const kindOf = (mime: string) => (mime.startsWith("image/") ? "image" : mime.startsWith("audio/") ? "audio" : "file");
  const docs = await listDocMetaByPrefix(`${threadId}:msg:`);
  const attByMsg = new Map<string, { docId: string; kind: string; name: string | null }[]>();
  for (const d of docs) {
    const mid = d.ownerId.slice(`${threadId}:msg:`.length);
    if (!mid) continue;
    const list = attByMsg.get(mid) ?? [];
    list.push({ docId: d.docId, kind: kindOf(d.mime), name: d.name });
    attByMsg.set(mid, list);
  }
  await markThreadRead(threadId, me.id);
  return NextResponse.json({ ok: true, messages: msgs.map((m) => ({ ...m, attachments: attByMsg.get(m.id) ?? [] })) });
}

export const dynamic = "force-dynamic";
