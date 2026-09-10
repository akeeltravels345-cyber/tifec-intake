// Per-clinician video connections. Each clinician connects their OWN Zoom
// and/or Google account (OAuth), and their virtual bookings generate a meeting
// link on that account — the Acuity/Calendly model.
//
// The app is registered ONCE with each provider (client id/secret in env); each
// clinician then authorizes individually in the browser. Env needed:
//   Zoom:   ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET   (an OAuth "User-managed" app)
//   Google: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
// Redirect URIs registered with each provider must be:
//   <base>/api/scheduling/video/callback/zoom
//   <base>/api/scheduling/video/callback/google
//
// Tokens are stored per clinician. Link creation is best-effort: any failure
// returns null and the booking falls back to a manually entered link.

import fs from "fs";
import path from "path";

export type VideoProviderId = "zoom" | "google";
export interface VideoConnection {
  clinicianId: string;
  provider: VideoProviderId;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;      // epoch ms
  accountEmail: string;
  preferred: boolean;     // which one wins when a clinician has both
  connectedAt: string;
}
export interface VideoLink { url: string; provider: VideoProviderId; ref: string } // ref = cancellation key (Google event id; "" for Zoom, whose id is in the url)
interface MeetingArgs { topic: string; startAtISO: string; durationMin: number }

export const PROVIDER_LABEL: Record<VideoProviderId, string> = { zoom: "Zoom", google: "Google Meet" };
export const zoomOAuthConfigured = () => !!(process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET);
export const googleOAuthConfigured = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
export const oauthConfigured = (p: VideoProviderId) => (p === "zoom" ? zoomOAuthConfigured() : googleOAuthConfigured());

// ---------------------------------------------------------------------------
// Storage (Neon Postgres, or a gitignored JSON file in local dev)
// ---------------------------------------------------------------------------
const usePostgres = !!process.env.DATABASE_URL;
async function pg() { const { neon } = await import("@neondatabase/serverless"); return neon(process.env.DATABASE_URL as string); }
const FILE = "scheduling-video-connections.local.json";
const filePath = () => path.join(process.cwd(), "data", FILE);
function readFile(): VideoConnection[] { try { return JSON.parse(fs.readFileSync(filePath(), "utf8")); } catch { return []; } }
function writeFile(rows: VideoConnection[]) { fs.mkdirSync(path.dirname(filePath()), { recursive: true }); fs.writeFileSync(filePath(), JSON.stringify(rows, null, 2)); }

function rowToConn(r: Record<string, unknown>): VideoConnection {
  return {
    clinicianId: String(r.clinician_id), provider: (r.provider === "google" ? "google" : "zoom"),
    accessToken: String(r.access_token || ""), refreshToken: String(r.refresh_token || ""),
    expiresAt: Number(r.expires_at) || 0, accountEmail: String(r.account_email || ""),
    // Postgres returns timestamptz as a Date; keep it ISO so it re-inserts cleanly.
    preferred: !!r.preferred, connectedAt: r.connected_at instanceof Date ? r.connected_at.toISOString() : (r.connected_at ? String(r.connected_at) : new Date().toISOString()),
  };
}

export async function listConnections(clinicianId: string): Promise<VideoConnection[]> {
  try {
    if (usePostgres) {
      const sql = await pg();
      const rows = (await sql`SELECT * FROM scheduling_video_connections WHERE clinician_id=${clinicianId}`) as Record<string, unknown>[];
      return rows.map(rowToConn);
    }
    return readFile().filter((c) => c.clinicianId === clinicianId);
  } catch { return []; } // table not migrated yet — clinician simply has no connections
}

export async function getPreferredConnection(clinicianId: string): Promise<VideoConnection | null> {
  const all = await listConnections(clinicianId);
  if (all.length === 0) return null;
  return all.find((c) => c.preferred) || all[0];
}

async function persistConnection(conn: VideoConnection) {
  if (usePostgres) {
    const sql = await pg();
    await sql`INSERT INTO scheduling_video_connections
      (clinician_id, provider, access_token, refresh_token, expires_at, account_email, preferred, connected_at)
      VALUES (${conn.clinicianId}, ${conn.provider}, ${conn.accessToken}, ${conn.refreshToken}, ${conn.expiresAt}, ${conn.accountEmail}, ${conn.preferred}, ${conn.connectedAt})
      ON CONFLICT (clinician_id, provider) DO UPDATE SET
        access_token=EXCLUDED.access_token, refresh_token=EXCLUDED.refresh_token, expires_at=EXCLUDED.expires_at,
        account_email=EXCLUDED.account_email, preferred=EXCLUDED.preferred`;
  } else {
    const rows = readFile().filter((c) => !(c.clinicianId === conn.clinicianId && c.provider === conn.provider));
    rows.push(conn); writeFile(rows);
  }
}

/** Save a freshly authorized connection. First connection is preferred by default. */
export async function saveConnection(input: Omit<VideoConnection, "preferred" | "connectedAt">): Promise<void> {
  const existing = await listConnections(input.clinicianId);
  const already = existing.find((c) => c.provider === input.provider);
  const preferred = already ? already.preferred : existing.length === 0; // keep prior choice, else default the first
  await persistConnection({ ...input, preferred, connectedAt: already?.connectedAt || new Date().toISOString() });
}

export async function setPreferred(clinicianId: string, provider: VideoProviderId): Promise<void> {
  const all = await listConnections(clinicianId);
  for (const c of all) await persistConnection({ ...c, preferred: c.provider === provider });
}

export async function deleteConnection(clinicianId: string, provider: VideoProviderId): Promise<void> {
  if (usePostgres) {
    const sql = await pg();
    await sql`DELETE FROM scheduling_video_connections WHERE clinician_id=${clinicianId} AND provider=${provider}`;
  } else {
    writeFile(readFile().filter((c) => !(c.clinicianId === clinicianId && c.provider === provider)));
  }
  // If we removed the preferred one, promote whatever remains.
  const rest = await listConnections(clinicianId);
  if (rest.length && !rest.some((c) => c.preferred)) await persistConnection({ ...rest[0], preferred: true });
}

// ---------------------------------------------------------------------------
// OAuth — authorize URLs, code exchange, token refresh
// ---------------------------------------------------------------------------
const ZOOM_SCOPE = "meeting:write:meeting meeting:write"; // both new + legacy scope strings
const GOOGLE_SCOPE = "openid email https://www.googleapis.com/auth/calendar.events";

export function authorizeUrl(provider: VideoProviderId, redirectUri: string, state: string): string {
  if (provider === "zoom") {
    const p = new URLSearchParams({ response_type: "code", client_id: process.env.ZOOM_CLIENT_ID as string, redirect_uri: redirectUri, state });
    return `https://zoom.us/oauth/authorize?${p}`;
  }
  const p = new URLSearchParams({
    response_type: "code", client_id: process.env.GOOGLE_CLIENT_ID as string, redirect_uri: redirectUri,
    scope: GOOGLE_SCOPE, access_type: "offline", prompt: "consent", include_granted_scopes: "true", state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

interface TokenSet { accessToken: string; refreshToken: string; expiresAt: number; accountEmail: string; scope: string }

// decode a JWT payload without verifying (only to read the email claim)
function jwtEmail(idToken: string): string {
  try { return JSON.parse(Buffer.from(idToken.split(".")[1], "base64").toString()).email || ""; } catch { return ""; }
}

export async function exchangeCode(provider: VideoProviderId, code: string, redirectUri: string): Promise<TokenSet> {
  if (provider === "zoom") {
    const basic = Buffer.from(`${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`).toString("base64");
    const res = await fetch("https://zoom.us/oauth/token", {
      method: "POST", headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
    });
    if (!res.ok) throw new Error(`Zoom token ${res.status}: ${await res.text()}`);
    const j = await res.json() as { access_token: string; refresh_token: string; expires_in: number };
    let email = "";
    try { const me = await fetch("https://api.zoom.us/v2/users/me", { headers: { Authorization: `Bearer ${j.access_token}` } }); if (me.ok) email = (await me.json()).email || ""; } catch { /* email optional */ }
    return { accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: Date.now() + (j.expires_in || 3600) * 1000, accountEmail: email, scope: "" };
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: process.env.GOOGLE_CLIENT_ID as string, client_secret: process.env.GOOGLE_CLIENT_SECRET as string }),
  });
  if (!res.ok) throw new Error(`Google token ${res.status}: ${await res.text()}`);
  const j = await res.json() as { access_token: string; refresh_token: string; expires_in: number; id_token?: string; scope?: string };
  return { accessToken: j.access_token, refreshToken: j.refresh_token || "", expiresAt: Date.now() + (j.expires_in || 3600) * 1000, accountEmail: j.id_token ? jwtEmail(j.id_token) : "", scope: j.scope || "" };
}

async function refreshToken(conn: VideoConnection): Promise<string> {
  if (!conn.refreshToken) throw new Error("No refresh token — reconnect needed.");
  if (conn.provider === "zoom") {
    const basic = Buffer.from(`${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`).toString("base64");
    const res = await fetch("https://zoom.us/oauth/token", {
      method: "POST", headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: conn.refreshToken }),
    });
    if (!res.ok) throw new Error(`Zoom refresh ${res.status}`);
    const j = await res.json() as { access_token: string; refresh_token: string; expires_in: number };
    await persistConnection({ ...conn, accessToken: j.access_token, refreshToken: j.refresh_token || conn.refreshToken, expiresAt: Date.now() + (j.expires_in || 3600) * 1000 });
    return j.access_token;
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: conn.refreshToken, client_id: process.env.GOOGLE_CLIENT_ID as string, client_secret: process.env.GOOGLE_CLIENT_SECRET as string }),
  });
  if (!res.ok) throw new Error(`Google refresh ${res.status}`);
  const j = await res.json() as { access_token: string; expires_in: number };
  await persistConnection({ ...conn, accessToken: j.access_token, expiresAt: Date.now() + (j.expires_in || 3600) * 1000 });
  return j.access_token;
}

async function validAccessToken(conn: VideoConnection): Promise<string> {
  if (conn.expiresAt > Date.now() + 60_000) return conn.accessToken;
  return refreshToken(conn);
}

// ---------------------------------------------------------------------------
// Meeting creation (on the clinician's own account)
// ---------------------------------------------------------------------------
async function zoomCreate(token: string, { topic, startAtISO, durationMin }: MeetingArgs): Promise<string> {
  const res = await fetch("https://api.zoom.us/v2/users/me/meetings", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    // Confidentiality: waiting room on + no join-before-host, so clients wait
    // until the clinician admits them and nobody is in the room beforehand.
    body: JSON.stringify({ topic: topic.slice(0, 200), type: 2, start_time: startAtISO, duration: Math.max(1, Math.round(durationMin)), timezone: "UTC", settings: { waiting_room: true, join_before_host: false } }),
  });
  if (!res.ok) throw new Error(`Zoom meeting ${res.status}: ${await res.text()}`);
  const j = await res.json() as { join_url: string };
  if (!j.join_url) throw new Error("Zoom returned no join_url");
  return j.join_url;
}
async function googleCreate(token: string, { topic, startAtISO, durationMin }: MeetingArgs): Promise<{ url: string; eventId: string }> {
  const end = new Date(Date.parse(startAtISO) + Math.max(1, durationMin) * 60_000).toISOString();
  const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      summary: topic.slice(0, 200), start: { dateTime: startAtISO, timeZone: "UTC" }, end: { dateTime: end, timeZone: "UTC" },
      conferenceData: { createRequest: { requestId: `tifec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, conferenceSolutionKey: { type: "hangoutsMeet" } } },
    }),
  });
  if (!res.ok) throw new Error(`Google event ${res.status}: ${await res.text()}`);
  const j = await res.json() as { id?: string; hangoutLink?: string; conferenceData?: { entryPoints?: { entryPointType: string; uri: string }[] } };
  const link = j.hangoutLink || j.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri;
  if (!link) throw new Error("Google returned no Meet link");
  return { url: link, eventId: j.id || "" };
}

/** Create a meeting link on the clinician's preferred connected account, or null. */
export async function createVideoLink(clinicianId: string, args: MeetingArgs): Promise<VideoLink | null> {
  const conn = await getPreferredConnection(clinicianId);
  if (!conn) return null;
  try {
    const token = await validAccessToken(conn);
    if (conn.provider === "zoom") return { url: await zoomCreate(token, args), provider: "zoom", ref: "" };
    const g = await googleCreate(token, args);
    return { url: g.url, provider: "google", ref: g.eventId };
  } catch (e) {
    console.error(`createVideoLink (${conn.provider}) failed for ${clinicianId}`, e);
    return null;
  }
}

// The numeric meeting id lives in a Zoom join url, e.g. https://zoom.us/j/1234567890?pwd=...
function zoomMeetingId(url: string): string | null {
  const m = (url || "").match(/zoom\.us\/(?:j|wc\/join)\/(\d+)/i);
  return m ? m[1] : null;
}

/** Best-effort cancel of the meeting behind a stored link, on the clinician's
 *  own account, so deleting/cancelling an appointment doesn't orphan the Zoom
 *  meeting or Google Calendar event. `ref` is the Google event id (Zoom's id is
 *  read from the join url). Never throws. */
export async function cancelVideoLink(clinicianId: string, locationOrLink: string, ref?: string): Promise<void> {
  const zoomId = zoomMeetingId(locationOrLink);
  const isMeet = /meet\.google\.com/i.test(locationOrLink || "");
  const provider: VideoProviderId | null = zoomId ? "zoom" : (isMeet && ref ? "google" : null);
  if (!provider) return;
  const conn = (await listConnections(clinicianId)).find((c) => c.provider === provider);
  if (!conn) return;
  try {
    const token = await validAccessToken(conn);
    const res = provider === "zoom"
      ? await fetch(`https://api.zoom.us/v2/meetings/${zoomId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } })
      : await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(ref as string)}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    // 404 / 410 = already gone; treat as success.
    if (!res.ok && res.status !== 404 && res.status !== 410) throw new Error(`${provider} cancel ${res.status}: ${await res.text()}`);
  } catch (e) {
    console.error(`cancelVideoLink (${provider}) failed for ${clinicianId}`, e);
  }
}
