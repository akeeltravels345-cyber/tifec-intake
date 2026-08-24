// =============================================================================
// Team comms: messages, tickets, notices. (ADDITIVE; separate from intake +
// billing tables.)
//   • Production: Neon Postgres (DATABASE_URL), comms_* tables.
//   • Local dev:  data/comms-*.local.json files (gitignored).
// Bodies are AES-encrypted at rest, like intake answers and client names: this
// is staff chat inside a psychology practice, so assume it will eventually
// contain something sensitive even though we ask people to keep clients out.
// =============================================================================

import fs from "fs";
import path from "path";
import { encrypt, decrypt, randomId } from "./crypto";
import type { TicketStatus } from "./ticketStatus";

// A thread is either a direct message pair or the discussion on a ticket, so
// messages and ticket replies are the same thing in one table.
export const dmThreadId = (a: string, b: string) => `dm:${[a, b].sort().join("|")}`;
export const ticketThreadId = (ticketId: string) => `ticket:${ticketId}`;
export const dmPartner = (threadId: string, me: string): string | null => {
  if (!threadId.startsWith("dm:")) return null;
  const [a, b] = threadId.slice(3).split("|");
  return a === me ? b : a;
};

export type { TicketStatus } from "./ticketStatus";
export { TICKET_STATUS_LABEL, TICKET_STATUSES, isTicketStatus, statusActions, isOpenStatus } from "./ticketStatus";

// Subject areas a ticket can be filed under.
export const TICKET_AREAS = [
  "Billing & claims",
  "Insurance",
  "Client records & intake forms",
  "Scheduling",
  "Pay & payouts",
  "IT & access",
  "Office & facilities",
  "Other",
] as const;
export type TicketArea = (typeof TICKET_AREAS)[number];

export interface Message {
  id: string;
  threadId: string;
  senderId: string;
  body: string;
  createdAt: string;
}

export interface Ticket {
  id: string;
  ref: number; // short human reference, e.g. #7
  /** Who the ticket is FROM — the person with the issue. Usually whoever typed
   *  it in, but when a colleague logs it on someone's behalf this is that person. */
  createdBy: string;
  /** Who actually entered the ticket, when different from createdBy (i.e. it was
   *  raised on someone's behalf). null when the raiser logged it themselves. */
  enteredBy: string | null;
  /** One or more contacts. A billing question can need the biller AND the
   *  admin, so a ticket is never limited to a single owner. Always non-empty. */
  assignees: string[];
  area: TicketArea;
  subject: string;
  body: string;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
}

export type NotifyKind = "message" | "ticket_new" | "ticket_reply" | "ticket_status" | "notice";

export interface Notification {
  id: string;
  userId: string;      // who should see it
  kind: NotifyKind;
  body: string;        // deliberately free of client detail — see notify()
  href: string;
  createdAt: string;
  readAt: string | null;
}

export interface NoticeAck { userId: string; response: string; at: string }
export interface Notice {
  id: string;
  authorId: string;
  title: string;
  body: string;
  eventAt: string | null; // set when the notice is a meeting
  pinned: boolean;
  createdAt: string;
  askAck: boolean;        // does this notice ask people to acknowledge?
  acks: NoticeAck[];      // who has acknowledged, and how
}

const usePostgres = !!process.env.DATABASE_URL;
async function pg() {
  const { neon } = await import("@neondatabase/serverless");
  return neon(process.env.DATABASE_URL as string);
}

const dir = (f: string) => path.join(process.cwd(), "data", f);
function readJson<T>(file: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(dir(file), "utf8")) as T; } catch { return fallback; }
}
function writeJson(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(dir(file)), { recursive: true });
  fs.writeFileSync(dir(file), JSON.stringify(data, null, 2));
}
const MSG_FILE = "comms-messages.local.json";
const TIC_FILE = "comms-tickets.local.json";
const NOT_FILE = "comms-notices.local.json";
const READ_FILE = "comms-reads.local.json";
const NOTIF_FILE = "comms-notifications.local.json";

const str = (v: unknown) => (v == null ? "" : String(v));
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : str(v));
/** Never let one unreadable row break a whole thread. */
const safeDecrypt = (v: unknown) => { try { return decrypt(str(v)); } catch { return "[unreadable]"; } };

// ============================ Messages ======================================
export async function listMessages(threadId: string): Promise<Message[]> {
  if (usePostgres) {
    const sql = await pg();
    const rows = (await sql`
      SELECT id, thread_id, sender_id, body_enc, created_at
      FROM comms_messages WHERE thread_id = ${threadId} ORDER BY created_at`) as Record<string, unknown>[];
    return rows.map((r) => ({
      id: str(r.id), threadId: str(r.thread_id), senderId: str(r.sender_id),
      body: safeDecrypt(r.body_enc), createdAt: iso(r.created_at),
    }));
  }
  return readJson<StoredMessage[]>(MSG_FILE, [])
    .filter((m) => m.threadId === threadId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((m) => ({ id: m.id, threadId: m.threadId, senderId: m.senderId, body: safeDecrypt(m.bodyEnc), createdAt: m.createdAt }));
}

interface StoredMessage { id: string; threadId: string; senderId: string; bodyEnc: string; createdAt: string }

export async function sendMessage(threadId: string, senderId: string, body: string): Promise<Message> {
  const row = { id: randomId(), threadId, senderId, bodyEnc: encrypt(body), createdAt: new Date().toISOString() };
  if (usePostgres) {
    const sql = await pg();
    await sql`
      INSERT INTO comms_messages (id, thread_id, sender_id, body_enc, created_at)
      VALUES (${row.id}, ${threadId}, ${senderId}, ${row.bodyEnc}, ${row.createdAt})`;
  } else {
    const all = readJson<StoredMessage[]>(MSG_FILE, []);
    all.push(row);
    writeJson(MSG_FILE, all);
  }
  // Sending is reading: don't show someone their own message as unread.
  await markThreadRead(threadId, senderId);
  return { id: row.id, threadId, senderId, body, createdAt: row.createdAt };
}

/** Direct-message threads this person is in, newest activity first. Ticket
 *  discussion lives on the ticket, so it is deliberately not included here. */
export async function listThreadsFor(me: string): Promise<{ threadId: string; lastAt: string; lastBody: string; lastSender: string; unread: number }[]> {
  const reads = await getReads(me);
  const summarise = (msgs: { threadId: string; senderId: string; body: string; createdAt: string }[]) => {
    const byThread = new Map<string, typeof msgs>();
    for (const m of msgs) {
      if (!byThread.has(m.threadId)) byThread.set(m.threadId, []);
      byThread.get(m.threadId)!.push(m);
    }
    return [...byThread.entries()].map(([threadId, list]) => {
      list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const last = list[list.length - 1];
      const since = reads[threadId] ?? "";
      return {
        threadId, lastAt: last.createdAt, lastBody: last.body, lastSender: last.senderId,
        unread: list.filter((m) => m.senderId !== me && m.createdAt > since).length,
      };
    }).sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  };

  if (usePostgres) {
    const sql = await pg();
    // Same shape as the local-JSON branch below: DM threads containing me.
    const rows = (await sql`
      SELECT thread_id, sender_id, body_enc, created_at FROM comms_messages
      WHERE thread_id LIKE ${"dm:%"} AND thread_id LIKE ${"%" + me + "%"}
      ORDER BY created_at`) as Record<string, unknown>[];
    return summarise(rows.map((r) => ({
      threadId: str(r.thread_id), senderId: str(r.sender_id),
      body: safeDecrypt(r.body_enc), createdAt: iso(r.created_at),
    })));
  }
  const mine = readJson<StoredMessage[]>(MSG_FILE, []).filter((m) => m.threadId.startsWith("dm:") && m.threadId.includes(me));
  return summarise(mine.map((m) => ({ threadId: m.threadId, senderId: m.senderId, body: safeDecrypt(m.bodyEnc), createdAt: m.createdAt })));
}

// ============================ Read state ====================================
type Reads = Record<string, Record<string, string>>; // clinicianId -> threadId -> ISO

async function getReads(me: string): Promise<Record<string, string>> {
  if (usePostgres) {
    const sql = await pg();
    const rows = (await sql`SELECT thread_id, last_read_at FROM comms_reads WHERE clinician_id = ${me}`) as Record<string, unknown>[];
    return Object.fromEntries(rows.map((r) => [str(r.thread_id), iso(r.last_read_at)]));
  }
  return readJson<Reads>(READ_FILE, {})[me] ?? {};
}

export async function markThreadRead(threadId: string, me: string): Promise<void> {
  const now = new Date().toISOString();
  if (usePostgres) {
    const sql = await pg();
    await sql`
      INSERT INTO comms_reads (thread_id, clinician_id, last_read_at) VALUES (${threadId}, ${me}, ${now})
      ON CONFLICT (thread_id, clinician_id) DO UPDATE SET last_read_at = EXCLUDED.last_read_at`;
    return;
  }
  const all = readJson<Reads>(READ_FILE, {});
  all[me] = { ...(all[me] ?? {}), [threadId]: now };
  writeJson(READ_FILE, all);
}

// Presence: reuse the reads table (no migration) with a reserved thread id. Each
// request/heartbeat stamps the user's last-active time; everyone's is read back
// to show online dots + "last seen" in the chat.
const PRESENCE_THREAD = "presence:online";
/** Stamp this user as active now. */
export async function touchPresence(me: string): Promise<void> {
  try { await markThreadRead(PRESENCE_THREAD, me); } catch { /* presence is best-effort */ }
}

// Email throttle: for a chatty thread (ticket comments), only email each person
// once per window. Returns the subset of userIds that are "due" for an email
// (none within the window) AND stamps them, so the caller just emails those.
// Reuses the reads table with an `emailed:<thread>` key — no new table.
export async function claimEmailWindow(threadId: string, userIds: string[], windowMs = 30 * 60 * 1000): Promise<string[]> {
  const key = `emailed:${threadId}`;
  const now = Date.now();
  const due: string[] = [];
  for (const uid of userIds) {
    try {
      const last = (await getReads(uid))[key];
      if (!last || now - new Date(last).getTime() > windowMs) {
        due.push(uid);
        await markThreadRead(key, uid);
      }
    } catch { due.push(uid); } // if the check fails, don't swallow the notification
  }
  return due;
}
/** Everyone's last-active time, as { clinicianId: ISO }. */
export async function getPresence(): Promise<Record<string, string>> {
  try {
    if (usePostgres) {
      const sql = await pg();
      const rows = (await sql`SELECT clinician_id, last_read_at FROM comms_reads WHERE thread_id = ${PRESENCE_THREAD}`) as Record<string, unknown>[];
      return Object.fromEntries(rows.map((r) => [str(r.clinician_id), iso(r.last_read_at)]));
    }
    const all = readJson<Reads>(READ_FILE, {});
    const out: Record<string, string> = {};
    for (const [uid, threads] of Object.entries(all)) { if (threads[PRESENCE_THREAD]) out[uid] = threads[PRESENCE_THREAD]; }
    return out;
  } catch { return {}; }
}

// A single team-wide channel everyone shares ("start a conversation with all").
export const GROUP_THREAD_ID = "group:all";

/** Summary of the team-wide channel for one person (last message + unread). */
export async function groupSummaryFor(me: string): Promise<{ lastAt: string; lastBody: string; lastSender: string; unread: number }> {
  const [msgs, reads] = await Promise.all([listMessages(GROUP_THREAD_ID), getReads(me)]);
  const since = reads[GROUP_THREAD_ID] ?? "";
  const unread = msgs.filter((m) => m.senderId !== me && m.createdAt > since).length;
  const last = msgs[msgs.length - 1];
  return { lastAt: last?.createdAt ?? "", lastBody: last?.body ?? "", lastSender: last?.senderId ?? "", unread };
}

// -------- Custom group chats: named, member-picked conversations -------------
// Thread id is `group:<id>` (the reserved team-wide channel is `group:all`). The
// messages themselves live in comms_messages like every other thread; only the
// name + membership are stored here.
const GROUP_FILE = "comms-groups.local.json";
interface StoredGroup { id: string; nameEnc: string; memberIds: string[]; createdBy: string; createdAt: string }
export interface Group { threadId: string; name: string; memberIds: string[]; createdBy: string; createdAt: string }
export const isCustomGroup = (threadId: string) => threadId.startsWith("group:") && threadId !== GROUP_THREAD_ID;

async function allGroups(): Promise<Group[]> {
  if (usePostgres) {
    const sql = await pg();
    let rows: Record<string, unknown>[] = [];
    // Guarded so the app still works before the comms_groups migration is run.
    try { rows = (await sql`SELECT id, name_enc, member_ids, created_by, created_at FROM comms_groups`) as Record<string, unknown>[]; } catch { return []; }
    return rows.map((r) => ({ threadId: `group:${str(r.id)}`, name: safeDecrypt(r.name_enc), memberIds: toIds(r.member_ids), createdBy: str(r.created_by), createdAt: iso(r.created_at) }));
  }
  return readJson<StoredGroup[]>(GROUP_FILE, []).map((g) => ({ threadId: `group:${g.id}`, name: safeDecrypt(g.nameEnc), memberIds: g.memberIds, createdBy: g.createdBy, createdAt: g.createdAt }));
}

export async function getGroup(threadId: string): Promise<Group | null> {
  if (!isCustomGroup(threadId)) return null;
  return (await allGroups()).find((g) => g.threadId === threadId) ?? null;
}

export async function createGroup(name: string, memberIds: string[], createdBy: string): Promise<Group> {
  const id = randomId();
  const members = Array.from(new Set([createdBy, ...memberIds])).filter(Boolean);
  const nameEnc = encrypt(name);
  const createdAt = new Date().toISOString();
  if (usePostgres) {
    const sql = await pg();
    await sql`INSERT INTO comms_groups (id, name_enc, member_ids, created_by, created_at) VALUES (${id}, ${nameEnc}, ${JSON.stringify(members)}, ${createdBy}, ${createdAt})`;
  } else {
    const all = readJson<StoredGroup[]>(GROUP_FILE, []);
    all.push({ id, nameEnc, memberIds: members, createdBy, createdAt });
    writeJson(GROUP_FILE, all);
  }
  return { threadId: `group:${id}`, name, memberIds: members, createdBy, createdAt };
}

/** Custom group threads this person is a member of, newest activity first. */
export async function listGroupsForMember(me: string): Promise<{ threadId: string; name: string; memberIds: string[]; createdBy: string; lastAt: string; lastBody: string; lastSender: string; unread: number }[]> {
  const groups = (await allGroups()).filter((g) => g.memberIds.includes(me));
  const reads = await getReads(me);
  const out = await Promise.all(groups.map(async (g) => {
    const msgs = await listMessages(g.threadId);
    const since = reads[g.threadId] ?? "";
    const last = msgs[msgs.length - 1];
    return { threadId: g.threadId, name: g.name, memberIds: g.memberIds, createdBy: g.createdBy, lastAt: last?.createdAt ?? g.createdAt, lastBody: last?.body ?? "", lastSender: last?.senderId ?? "", unread: msgs.filter((m) => m.senderId !== me && m.createdAt > since).length };
  }));
  return out.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

// Update a group's membership or name. Returns the updated group, or null if it
// no longer exists.
async function writeGroup(threadId: string, patch: { memberIds?: string[]; name?: string }): Promise<Group | null> {
  const g = await getGroup(threadId);
  if (!g) return null;
  const id = threadId.slice("group:".length);
  const memberIds = patch.memberIds ? Array.from(new Set(patch.memberIds)).filter(Boolean) : g.memberIds;
  const name = patch.name !== undefined ? patch.name : g.name;
  if (usePostgres) {
    const sql = await pg();
    if (patch.memberIds) await sql`UPDATE comms_groups SET member_ids = ${JSON.stringify(memberIds)} WHERE id = ${id}`;
    if (patch.name !== undefined) await sql`UPDATE comms_groups SET name_enc = ${encrypt(name)} WHERE id = ${id}`;
  } else {
    const all = readJson<StoredGroup[]>(GROUP_FILE, []);
    const row = all.find((x) => x.id === id);
    if (!row) return null;
    if (patch.memberIds) row.memberIds = memberIds;
    if (patch.name !== undefined) row.nameEnc = encrypt(name);
    writeJson(GROUP_FILE, all);
  }
  return { ...g, memberIds, name };
}
export const setGroupMembers = (threadId: string, memberIds: string[]) => writeGroup(threadId, { memberIds });
export const renameGroup = (threadId: string, name: string) => writeGroup(threadId, { name });

export async function deleteGroup(threadId: string): Promise<void> {
  const id = threadId.slice("group:".length);
  if (usePostgres) {
    const sql = await pg();
    await sql`DELETE FROM comms_groups WHERE id = ${id}`;
  } else {
    writeJson(GROUP_FILE, readJson<StoredGroup[]>(GROUP_FILE, []).filter((x) => x.id !== id));
  }
}

/** Unread direct messages + the team channel + custom groups, for the nav badge. */
export async function unreadCount(me: string): Promise<number> {
  const [threads, group, groups] = await Promise.all([listThreadsFor(me), groupSummaryFor(me), listGroupsForMember(me)]);
  return threads.reduce((t, x) => t + x.unread, 0) + group.unread + groups.reduce((t, x) => t + x.unread, 0);
}

// ============================ Tickets =======================================
interface StoredTicket extends Omit<Ticket, "body" | "subject"> { bodyEnc: string; subjectEnc: string }

/** Read an assignee list back. Postgres hands JSONB back already parsed, but a
 *  driver or an older single-assignee row may give a plain string, so cope with
 *  both rather than crashing a whole ticket list. */
function toIds(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === "string" && v.trim()) {
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? p.map(String).filter(Boolean) : [v];
    } catch { return [v]; } // pre-JSONB row: one bare clinician id
  }
  return [];
}

export async function listTickets(): Promise<Ticket[]> {
  if (usePostgres) {
    const sql = await pg();
    // entered_by is added by db/migrate-ticket-entered-by.sql; fall back to a read
    // without it so the app never 500s if that migration hasn't run yet.
    let rows: Record<string, unknown>[];
    try {
      rows = (await sql`
        SELECT id, ref, created_by, entered_by, assignees, area, subject_enc, body_enc, status, created_at, updated_at
        FROM comms_tickets ORDER BY created_at DESC`) as Record<string, unknown>[];
    } catch {
      rows = (await sql`
        SELECT id, ref, created_by, assignees, area, subject_enc, body_enc, status, created_at, updated_at
        FROM comms_tickets ORDER BY created_at DESC`) as Record<string, unknown>[];
    }
    return rows.map((r) => ({
      id: str(r.id), ref: Number(r.ref), createdBy: str(r.created_by), enteredBy: r.entered_by ? str(r.entered_by) : null,
      assignees: toIds(r.assignees),
      area: str(r.area) as TicketArea, subject: safeDecrypt(r.subject_enc), body: safeDecrypt(r.body_enc),
      status: str(r.status) as TicketStatus, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
    }));
  }
  return readJson<StoredTicket[]>(TIC_FILE, [])
    .map((t) => ({ ...t, enteredBy: t.enteredBy ?? null, assignees: toIds(t.assignees), subject: safeDecrypt(t.subjectEnc), body: safeDecrypt(t.bodyEnc) }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getTicket(id: string): Promise<Ticket | undefined> {
  return (await listTickets()).find((t) => t.id === id);
}

/** Who commented LAST on every ticket, in one pass — used to work out whose turn
 *  it is (the "ball in court"). Keyed by ticket id. */
export async function lastTicketCommenters(): Promise<Record<string, string>> {
  const latest: Record<string, { senderId: string; at: string }> = {};
  const consider = (threadId: string, senderId: string, at: string) => {
    if (!threadId.startsWith("ticket:")) return;
    const tid = threadId.slice("ticket:".length);
    if (!latest[tid] || at > latest[tid].at) latest[tid] = { senderId, at };
  };
  if (usePostgres) {
    const sql = await pg();
    const rows = (await sql`SELECT thread_id, sender_id, created_at FROM comms_messages WHERE thread_id LIKE ${"ticket:%"} ORDER BY created_at`) as Record<string, unknown>[];
    for (const r of rows) consider(str(r.thread_id), str(r.sender_id), iso(r.created_at));
  } else {
    for (const m of readJson<StoredMessage[]>(MSG_FILE, [])) consider(m.threadId, m.senderId, m.createdAt);
  }
  const out: Record<string, string> = {};
  for (const [tid, v] of Object.entries(latest)) out[tid] = v.senderId;
  return out;
}

/** Whose turn it is on a ticket — the people it's waiting on. The ball follows the
 *  last comment: the raiser opening it (or speaking) puts it on the assignees; an
 *  assignee replying puts it back on the raiser; a resolved ticket waits on no one.
 *
 *  Whoever just replied is NEVER shown as still owing a reply — so even if a
 *  person is on both sides (they raised it AND it's assigned to them), their own
 *  comment always hands the ball to the other side. */
export function ticketWaitingOn(
  t: { createdBy: string; assignees: string[]; status: TicketStatus },
  lastCommenterId: string | null,
): string[] {
  if (t.status === "resolved") return [];
  const raiserSpokeLast = !lastCommenterId || lastCommenterId === t.createdBy;
  // The ball sits on the OTHER side from whoever spoke last.
  let ball = raiserSpokeLast ? t.assignees.slice() : [t.createdBy];
  ball = ball.filter((id) => id && id !== lastCommenterId);
  // If that left no one (e.g. the raiser is also the sole assignee), fall back to
  // the side that just spoke — still never the last speaker themselves.
  if (ball.length === 0) {
    const other = raiserSpokeLast ? [t.createdBy] : t.assignees;
    ball = other.filter((id) => id && id !== lastCommenterId);
  }
  return [...new Set(ball)];
}

export async function createTicket(input: {
  createdBy: string; enteredBy?: string | null; assignees: string[]; area: TicketArea; subject: string; body: string;
}): Promise<Ticket> {
  const now = new Date().toISOString();
  const existing = await listTickets();
  const ref = existing.reduce((m, t) => Math.max(m, t.ref), 0) + 1;
  const assignees = [...new Set(input.assignees)];
  const enteredBy = input.enteredBy && input.enteredBy !== input.createdBy ? input.enteredBy : null;
  const row: StoredTicket = {
    id: randomId(), ref, createdBy: input.createdBy, enteredBy, assignees,
    area: input.area, subjectEnc: encrypt(input.subject), bodyEnc: encrypt(input.body),
    status: "open", createdAt: now, updatedAt: now,
  };
  if (usePostgres) {
    const sql = await pg();
    await sql`
      INSERT INTO comms_tickets (id, ref, created_by, assignees, area, subject_enc, body_enc, status, created_at, updated_at)
      VALUES (${row.id}, ${ref}, ${row.createdBy}, ${JSON.stringify(assignees)}::jsonb, ${row.area}, ${row.subjectEnc}, ${row.bodyEnc}, ${row.status}, ${now}, ${now})`;
    // entered_by is a separate guarded write so it's a no-op before its migration.
    if (enteredBy) { try { await sql`UPDATE comms_tickets SET entered_by = ${enteredBy} WHERE id = ${row.id}`; } catch { /* column not migrated yet */ } }
  } else {
    const all = readJson<StoredTicket[]>(TIC_FILE, []);
    all.push(row);
    writeJson(TIC_FILE, all);
  }
  return { ...row, subject: input.subject, body: input.body };
}

export async function updateTicket(id: string, patch: { status?: TicketStatus; assignees?: string[] }): Promise<void> {
  const now = new Date().toISOString();
  const assignees = patch.assignees ? [...new Set(patch.assignees)] : undefined;
  if (usePostgres) {
    const sql = await pg();
    if (patch.status) await sql`UPDATE comms_tickets SET status = ${patch.status}, updated_at = ${now} WHERE id = ${id}`;
    if (assignees) await sql`UPDATE comms_tickets SET assignees = ${JSON.stringify(assignees)}::jsonb, updated_at = ${now} WHERE id = ${id}`;
    return;
  }
  const all = readJson<StoredTicket[]>(TIC_FILE, []);
  const i = all.findIndex((t) => t.id === id);
  if (i < 0) return;
  all[i] = { ...all[i], ...(patch.status ? { status: patch.status } : {}), ...(assignees ? { assignees } : {}), updatedAt: now };
  writeJson(TIC_FILE, all);
}

/** Permanently remove a ticket and its whole comment thread. Attachments in the
 *  doc store are cleaned up separately by the caller. */
export async function deleteTicket(id: string): Promise<void> {
  const threadId = ticketThreadId(id);
  if (usePostgres) {
    const sql = await pg();
    await sql`DELETE FROM comms_messages WHERE thread_id = ${threadId}`;
    await sql`DELETE FROM comms_tickets WHERE id = ${id}`;
    return;
  }
  writeJson(TIC_FILE, readJson<StoredTicket[]>(TIC_FILE, []).filter((t) => t.id !== id));
  writeJson(MSG_FILE, readJson<StoredMessage[]>(MSG_FILE, []).filter((m) => m.threadId !== threadId));
}

// ============================ Notices =======================================
interface StoredNotice extends Omit<Notice, "body" | "title" | "askAck" | "acks"> { bodyEnc: string; titleEnc: string }

// Acknowledgement + ask-ack state lives in a SEPARATE store keyed by notice id,
// so the notices table never changes and a missing table degrades to "no acks".
const NOTMETA_FILE = "comms-notice-meta.local.json";
type NoticeMeta = { askAck: boolean; acks: NoticeAck[] };
async function loadNoticeMeta(): Promise<Record<string, NoticeMeta>> {
  if (usePostgres) {
    try {
      const sql = await pg();
      const rows = (await sql`SELECT notice_id, ask_ack, acks FROM comms_notice_meta`) as Record<string, unknown>[];
      const out: Record<string, NoticeMeta> = {};
      for (const r of rows) {
        const raw = typeof r.acks === "string" ? JSON.parse(r.acks) : (r.acks ?? []);
        out[str(r.notice_id)] = { askAck: !!r.ask_ack, acks: Array.isArray(raw) ? (raw as NoticeAck[]) : [] };
      }
      return out;
    } catch { return {}; }
  }
  return readJson<Record<string, NoticeMeta>>(NOTMETA_FILE, {});
}
async function writeNoticeMeta(noticeId: string, meta: NoticeMeta): Promise<void> {
  if (usePostgres) {
    const sql = await pg();
    await sql`
      INSERT INTO comms_notice_meta (notice_id, ask_ack, acks)
      VALUES (${noticeId}, ${meta.askAck}, ${JSON.stringify(meta.acks)}::jsonb)
      ON CONFLICT (notice_id) DO UPDATE SET ask_ack = EXCLUDED.ask_ack, acks = EXCLUDED.acks`;
    return;
  }
  const all = readJson<Record<string, NoticeMeta>>(NOTMETA_FILE, {});
  all[noticeId] = meta;
  writeJson(NOTMETA_FILE, all);
}
/** Record (or replace) one person's acknowledgement of a notice. */
export async function acknowledgeNotice(noticeId: string, userId: string, response: string): Promise<void> {
  const meta = (await loadNoticeMeta())[noticeId] ?? { askAck: true, acks: [] };
  meta.acks = [...meta.acks.filter((a) => a.userId !== userId), { userId, response: response.slice(0, 40), at: new Date().toISOString() }];
  await writeNoticeMeta(noticeId, meta);
}

export async function listNotices(): Promise<Notice[]> {
  let base: Omit<Notice, "askAck" | "acks">[];
  if (usePostgres) {
    const sql = await pg();
    const rows = (await sql`
      SELECT id, author_id, title_enc, body_enc, event_at, pinned, created_at
      FROM comms_notices ORDER BY pinned DESC, created_at DESC`) as Record<string, unknown>[];
    base = rows.map((r) => ({
      id: str(r.id), authorId: str(r.author_id), title: safeDecrypt(r.title_enc), body: safeDecrypt(r.body_enc),
      eventAt: r.event_at ? iso(r.event_at) : null, pinned: !!r.pinned, createdAt: iso(r.created_at),
    }));
  } else {
    base = readJson<StoredNotice[]>(NOT_FILE, [])
      .map((n) => ({ ...n, title: safeDecrypt(n.titleEnc), body: safeDecrypt(n.bodyEnc) }))
      .sort((a, b) => (a.pinned === b.pinned ? b.createdAt.localeCompare(a.createdAt) : a.pinned ? -1 : 1));
  }
  const meta = await loadNoticeMeta();
  return base.map((n) => ({ ...n, askAck: meta[n.id]?.askAck ?? false, acks: meta[n.id]?.acks ?? [] }));
}

export async function createNotice(input: {
  authorId: string; title: string; body: string; eventAt: string | null; pinned: boolean; askAck?: boolean;
}): Promise<Notice> {
  const row: StoredNotice = {
    id: randomId(), authorId: input.authorId, titleEnc: encrypt(input.title), bodyEnc: encrypt(input.body),
    eventAt: input.eventAt, pinned: input.pinned, createdAt: new Date().toISOString(),
  };
  if (usePostgres) {
    const sql = await pg();
    await sql`
      INSERT INTO comms_notices (id, author_id, title_enc, body_enc, event_at, pinned, created_at)
      VALUES (${row.id}, ${row.authorId}, ${row.titleEnc}, ${row.bodyEnc}, ${row.eventAt}, ${row.pinned}, ${row.createdAt})`;
  } else {
    const all = readJson<StoredNotice[]>(NOT_FILE, []);
    all.push(row);
    writeJson(NOT_FILE, all);
  }
  await writeNoticeMeta(row.id, { askAck: !!input.askAck, acks: [] });
  return { ...row, title: input.title, body: input.body, askAck: !!input.askAck, acks: [] };
}

// ============================ Notifications =================================
// Bodies are written by the server and never contain a ticket subject, a notice
// title or a message body — those can name a client, and a notification is the
// one thing people glance at with someone else looking over their shoulder.

export async function notify(userIds: string[], kind: NotifyKind, body: string, href: string): Promise<void> {
  const targets = [...new Set(userIds)].filter(Boolean);
  if (targets.length === 0) return;
  const now = new Date().toISOString();
  const rows = targets.map((userId) => ({ id: randomId(), userId, kind, body, href, createdAt: now }));

  if (usePostgres) {
    const sql = await pg();
    for (const r of rows) {
      await sql`
        INSERT INTO comms_notifications (id, user_id, kind, body, href, created_at)
        VALUES (${r.id}, ${r.userId}, ${r.kind}, ${r.body}, ${r.href}, ${r.createdAt})`;
    }
    return;
  }
  const all = readJson<(typeof rows[number] & { readAt: string | null })[]>(NOTIF_FILE, []);
  all.push(...rows.map((r) => ({ ...r, readAt: null })));
  writeJson(NOTIF_FILE, all);
}

export async function listNotifications(userId: string, limit = 25): Promise<Notification[]> {
  if (usePostgres) {
    const sql = await pg();
    const rows = (await sql`
      SELECT id, user_id, kind, body, href, created_at, read_at
      FROM comms_notifications WHERE user_id = ${userId}
      ORDER BY created_at DESC LIMIT ${limit}`) as Record<string, unknown>[];
    return rows.map((r) => ({
      id: str(r.id), userId: str(r.user_id), kind: str(r.kind) as NotifyKind, body: str(r.body),
      href: str(r.href), createdAt: iso(r.created_at), readAt: r.read_at ? iso(r.read_at) : null,
    }));
  }
  return readJson<Notification[]>(NOTIF_FILE, [])
    .filter((n) => n.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export async function unreadNotifications(userId: string): Promise<number> {
  if (usePostgres) {
    const sql = await pg();
    const rows = (await sql`SELECT count(*)::int AS n FROM comms_notifications WHERE user_id = ${userId} AND read_at IS NULL`) as Record<string, unknown>[];
    return Number(rows[0]?.n ?? 0);
  }
  return readJson<Notification[]>(NOTIF_FILE, []).filter((n) => n.userId === userId && !n.readAt).length;
}

export async function markNotificationsRead(userId: string): Promise<void> {
  const now = new Date().toISOString();
  if (usePostgres) {
    const sql = await pg();
    await sql`UPDATE comms_notifications SET read_at = ${now} WHERE user_id = ${userId} AND read_at IS NULL`;
    return;
  }
  const all = readJson<Notification[]>(NOTIF_FILE, []);
  writeJson(NOTIF_FILE, all.map((n) => (n.userId === userId && !n.readAt ? { ...n, readAt: now } : n)));
}

// ============================ Email delivery log ============================
const EMAILLOG_FILE = "comms-email-log.local.json";
export interface EmailLogEntry {
  id: string; recipientId: string; recipientEmail: string;
  kind: string; status: "sent" | "failed" | "skipped"; detail: string; createdAt: string;
}

/** Record the outcome of one team email. Never throws (logging must not break
 *  the action it's observing). */
export async function logEmail(e: Omit<EmailLogEntry, "id" | "createdAt">): Promise<void> {
  try {
    const row: EmailLogEntry = { ...e, id: randomId(), createdAt: new Date().toISOString() };
    if (usePostgres) {
      const sql = await pg();
      await sql`INSERT INTO comms_email_log (id, recipient_id, recipient_email, kind, status, detail, created_at)
        VALUES (${row.id}, ${row.recipientId}, ${row.recipientEmail}, ${row.kind}, ${row.status}, ${row.detail}, ${row.createdAt})`;
      return;
    }
    const all = readJson<EmailLogEntry[]>(EMAILLOG_FILE, []);
    all.push(row);
    writeJson(EMAILLOG_FILE, all);
  } catch { /* logging is best-effort */ }
}

export async function listEmailLog(limit = 100): Promise<EmailLogEntry[]> {
  if (usePostgres) {
    const sql = await pg();
    const rows = (await sql`SELECT * FROM comms_email_log ORDER BY created_at DESC LIMIT ${limit}`) as Record<string, unknown>[];
    return rows.map((r) => ({ id: str(r.id), recipientId: str(r.recipient_id), recipientEmail: str(r.recipient_email), kind: str(r.kind), status: str(r.status) as EmailLogEntry["status"], detail: str(r.detail), createdAt: iso(r.created_at) }));
  }
  return readJson<EmailLogEntry[]>(EMAILLOG_FILE, []).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}

export async function getNotice(id: string): Promise<Notice | undefined> {
  return (await listNotices()).find((n) => n.id === id);
}

export async function updateNotice(id: string, input: { title: string; body: string; eventAt: string | null; pinned: boolean }): Promise<void> {
  const titleEnc = encrypt(input.title), bodyEnc = encrypt(input.body);
  if (usePostgres) {
    const sql = await pg();
    await sql`UPDATE comms_notices SET title_enc = ${titleEnc}, body_enc = ${bodyEnc}, event_at = ${input.eventAt}, pinned = ${input.pinned} WHERE id = ${id}`;
    return;
  }
  const all = readJson<StoredNotice[]>(NOT_FILE, []);
  const n = all.find((x) => x.id === id);
  if (!n) return;
  n.titleEnc = titleEnc; n.bodyEnc = bodyEnc; n.eventAt = input.eventAt; n.pinned = input.pinned;
  writeJson(NOT_FILE, all);
}

export async function deleteNotice(id: string): Promise<void> {
  if (usePostgres) {
    const sql = await pg();
    await sql`DELETE FROM comms_notices WHERE id = ${id}`;
    return;
  }
  writeJson(NOT_FILE, readJson<StoredNotice[]>(NOT_FILE, []).filter((n) => n.id !== id));
}
