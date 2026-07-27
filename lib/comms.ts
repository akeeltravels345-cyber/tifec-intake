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

// A thread is either a direct message pair or the discussion on a ticket, so
// messages and ticket replies are the same thing in one table.
export const dmThreadId = (a: string, b: string) => `dm:${[a, b].sort().join("|")}`;
export const ticketThreadId = (ticketId: string) => `ticket:${ticketId}`;
export const dmPartner = (threadId: string, me: string): string | null => {
  if (!threadId.startsWith("dm:")) return null;
  const [a, b] = threadId.slice(3).split("|");
  return a === me ? b : a;
};

export type TicketStatus = "open" | "in_progress" | "resolved";
export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
};

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
  createdBy: string;
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

export interface Notice {
  id: string;
  authorId: string;
  title: string;
  body: string;
  eventAt: string | null; // set when the notice is a meeting
  pinned: boolean;
  createdAt: string;
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

/** Unread direct messages, for the nav badge. */
export async function unreadCount(me: string): Promise<number> {
  const threads = await listThreadsFor(me);
  return threads.reduce((t, x) => t + x.unread, 0);
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
    const rows = (await sql`
      SELECT id, ref, created_by, assignees, area, subject_enc, body_enc, status, created_at, updated_at
      FROM comms_tickets ORDER BY created_at DESC`) as Record<string, unknown>[];
    return rows.map((r) => ({
      id: str(r.id), ref: Number(r.ref), createdBy: str(r.created_by), assignees: toIds(r.assignees),
      area: str(r.area) as TicketArea, subject: safeDecrypt(r.subject_enc), body: safeDecrypt(r.body_enc),
      status: str(r.status) as TicketStatus, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
    }));
  }
  return readJson<StoredTicket[]>(TIC_FILE, [])
    .map((t) => ({ ...t, assignees: toIds(t.assignees), subject: safeDecrypt(t.subjectEnc), body: safeDecrypt(t.bodyEnc) }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getTicket(id: string): Promise<Ticket | undefined> {
  return (await listTickets()).find((t) => t.id === id);
}

export async function createTicket(input: {
  createdBy: string; assignees: string[]; area: TicketArea; subject: string; body: string;
}): Promise<Ticket> {
  const now = new Date().toISOString();
  const existing = await listTickets();
  const ref = existing.reduce((m, t) => Math.max(m, t.ref), 0) + 1;
  const assignees = [...new Set(input.assignees)];
  const row: StoredTicket = {
    id: randomId(), ref, createdBy: input.createdBy, assignees,
    area: input.area, subjectEnc: encrypt(input.subject), bodyEnc: encrypt(input.body),
    status: "open", createdAt: now, updatedAt: now,
  };
  if (usePostgres) {
    const sql = await pg();
    await sql`
      INSERT INTO comms_tickets (id, ref, created_by, assignees, area, subject_enc, body_enc, status, created_at, updated_at)
      VALUES (${row.id}, ${ref}, ${row.createdBy}, ${JSON.stringify(assignees)}::jsonb, ${row.area}, ${row.subjectEnc}, ${row.bodyEnc}, ${row.status}, ${now}, ${now})`;
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

// ============================ Notices =======================================
interface StoredNotice extends Omit<Notice, "body" | "title"> { bodyEnc: string; titleEnc: string }

export async function listNotices(): Promise<Notice[]> {
  if (usePostgres) {
    const sql = await pg();
    const rows = (await sql`
      SELECT id, author_id, title_enc, body_enc, event_at, pinned, created_at
      FROM comms_notices ORDER BY pinned DESC, created_at DESC`) as Record<string, unknown>[];
    return rows.map((r) => ({
      id: str(r.id), authorId: str(r.author_id), title: safeDecrypt(r.title_enc), body: safeDecrypt(r.body_enc),
      eventAt: r.event_at ? iso(r.event_at) : null, pinned: !!r.pinned, createdAt: iso(r.created_at),
    }));
  }
  return readJson<StoredNotice[]>(NOT_FILE, [])
    .map((n) => ({ ...n, title: safeDecrypt(n.titleEnc), body: safeDecrypt(n.bodyEnc) }))
    .sort((a, b) => (a.pinned === b.pinned ? b.createdAt.localeCompare(a.createdAt) : a.pinned ? -1 : 1));
}

export async function createNotice(input: {
  authorId: string; title: string; body: string; eventAt: string | null; pinned: boolean;
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
  return { ...row, title: input.title, body: input.body };
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
